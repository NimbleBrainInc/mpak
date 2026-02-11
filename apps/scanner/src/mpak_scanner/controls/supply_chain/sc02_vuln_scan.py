"""SC-02: Vulnerability Scan control.

Uses Grype for CVE detection, enriched with:
- EPSS (Exploit Prediction Scoring System) for exploitation probability
- CISA KEV (Known Exploited Vulnerabilities) catalog for actively exploited CVEs

Blocking logic per MTF spec:
- KEV match = CRITICAL (actively exploited)
- CVSS 9.0+ = CRITICAL
- CVSS 7.0-8.9 + EPSS >10% = HIGH (likely to be exploited)
- CVSS 7.0-8.9 + EPSS <=10% = MEDIUM (severe but low exploitation probability)
"""

import json
import logging
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

logger = logging.getLogger(__name__)

# EPSS API endpoint (FIRST.org)
EPSS_API_URL = "https://api.first.org/data/v1/epss"

# CISA KEV catalog URL
KEV_CATALOG_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"

# Cache for KEV catalog (loaded once per scan)
_kev_cache: set[str] | None = None

# EPSS threshold for escalating HIGH severity CVEs
EPSS_ESCALATION_THRESHOLD = 0.10  # 10%


def fetch_kev_catalog() -> set[str]:
    """Fetch CISA KEV catalog and return set of CVE IDs."""
    global _kev_cache
    if _kev_cache is not None:
        return _kev_cache

    try:
        # URL is hardcoded HTTPS to trusted government source (CISA)
        req = urllib.request.Request(  # noqa: S310
            KEV_CATALOG_URL,
            headers={"User-Agent": "mpak-scanner/1.0"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:  # noqa: S310
            data = json.loads(response.read().decode("utf-8"))
            _kev_cache = {v["cveID"] for v in data.get("vulnerabilities", [])}
            return _kev_cache
    except Exception:
        # If we can't fetch KEV, return empty set (graceful degradation)
        _kev_cache = set()
        return _kev_cache


def fetch_epss_scores(cve_ids: list[str]) -> dict[str, float]:
    """Fetch EPSS scores for a list of CVE IDs.

    Returns dict mapping CVE ID to EPSS score (0.0 to 1.0).
    """
    if not cve_ids:
        return {}

    # EPSS API accepts comma-separated CVE IDs
    # Batch in groups of 100 to avoid URL length limits
    scores: dict[str, float] = {}
    batch_size = 100

    for i in range(0, len(cve_ids), batch_size):
        batch = cve_ids[i : i + batch_size]
        try:
            cve_param = ",".join(batch)
            url = f"{EPSS_API_URL}?cve={cve_param}"
            # URL uses hardcoded HTTPS base to trusted FIRST.org API
            req = urllib.request.Request(  # noqa: S310
                url,
                headers={"User-Agent": "mpak-scanner/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as response:  # noqa: S310
                data = json.loads(response.read().decode("utf-8"))
                for entry in data.get("data", []):
                    cve_id = entry.get("cve")
                    epss = entry.get("epss")
                    if cve_id and epss is not None:
                        scores[cve_id] = float(epss)
        except Exception:  # noqa: S110
            # If EPSS fetch fails, continue without scores (graceful degradation)
            # This is intentional - we don't want network issues to block scanning
            continue

    return scores


def get_cvss_score(vuln: dict[str, Any]) -> float | None:
    """Extract CVSS score from Grype vulnerability data."""
    # Grype includes CVSS in relatedVulnerabilities or cvss field
    cvss_data = vuln.get("cvss", [])
    if cvss_data:
        # Prefer CVSS 3.x over 2.x
        for cvss in cvss_data:
            if cvss.get("version", "").startswith("3"):
                metrics = cvss.get("metrics", {})
                if "baseScore" in metrics:
                    return float(metrics["baseScore"])
        # Fallback to any CVSS score
        for cvss in cvss_data:
            metrics = cvss.get("metrics", {})
            if "baseScore" in metrics:
                return float(metrics["baseScore"])
    return None


@ControlRegistry.register
class SC02VulnerabilityScan(Control):
    """SC-02: Vulnerability Scan.

    Requirement: The bundle MUST be scanned for known vulnerabilities.
    Uses EPSS and KEV enrichment for risk-based blocking decisions.

    Blocking criteria (per MTF spec):
    - KEV match (actively exploited) = CRITICAL
    - CVSS 9.0+ = CRITICAL
    - CVSS 7.0-8.9 + EPSS >10% = HIGH (blocks)
    - CVSS 7.0-8.9 + EPSS <=10% = MEDIUM (does not block)
    """

    id = "SC-02"
    name = "Vulnerability Scan"
    domain = "supply_chain"
    description = "Scan for CVE vulnerabilities with EPSS/KEV enrichment"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()

        # Run Grype scan
        try:
            result = subprocess.run(
                ["grype", f"dir:{bundle_dir}", "-o", "json", "--add-cpes-if-none"],
                capture_output=True,
                text=True,
                timeout=180,
            )
        except FileNotFoundError:
            return self.error("grype not found. Install with: brew install grype")
        except subprocess.TimeoutExpired:
            return self.error("Vulnerability scan timed out")

        # Grype exits non-zero if it finds vulnerabilities, but also for errors
        stderr_preview = result.stderr[:200] if result.stderr else ""
        logger.info("grype exit=%d stdout=%d bytes stderr=%s", result.returncode, len(result.stdout), stderr_preview)
        if result.returncode != 0 and "no packages discovered" not in result.stderr.lower():
            if not result.stdout.strip():
                return ControlResult(
                    control_id=self.id,
                    control_name=self.name,
                    status=ControlStatus.FAIL,
                    error=result.stderr or "Vulnerability scan failed",
                    duration_ms=int((time.time() - start) * 1000),
                )

        try:
            if result.stdout.strip():
                data = json.loads(result.stdout)
            else:
                data = {"matches": []}

            matches = data.get("matches", [])

            # Extract CVE IDs for enrichment
            cve_ids = []
            for match in matches:
                vuln = match.get("vulnerability", {})
                cve_id = vuln.get("id", "")
                if cve_id.startswith("CVE-"):
                    cve_ids.append(cve_id)

            # Fetch enrichment data
            kev_catalog = fetch_kev_catalog()
            epss_scores = fetch_epss_scores(cve_ids)

            findings: list[Finding] = []
            has_blocking = False

            for i, match in enumerate(matches):
                vuln = match.get("vulnerability", {})
                artifact = match.get("artifact", {})
                cve_id = vuln.get("id", "unknown")
                severity_str = vuln.get("severity", "unknown").lower()

                # Get CVSS score and enrichment data
                cvss_score = get_cvss_score(vuln)
                epss_score = epss_scores.get(cve_id)
                in_kev = cve_id in kev_catalog

                # Determine severity using MTF blocking logic
                severity, is_blocking, reason = self._calculate_severity(severity_str, cvss_score, epss_score, in_kev)

                if is_blocking:
                    has_blocking = True

                fix_versions = vuln.get("fix", {}).get("versions", [])
                remediation = None
                if fix_versions:
                    remediation = f"Upgrade to version {', '.join(fix_versions)}"

                # Build description with enrichment context
                desc_parts = [vuln.get("description", "")[:150] or "No description available"]
                if reason:
                    desc_parts.append(f"[{reason}]")

                findings.append(
                    Finding(
                        id=f"SC-02-{i:04d}",
                        control=self.id,
                        severity=severity,
                        title=f"{cve_id}: {artifact.get('name', 'unknown')}",
                        description=" ".join(desc_parts),
                        remediation=remediation,
                        in_deps=True,
                        metadata={
                            "cve": cve_id,
                            "package": artifact.get("name"),
                            "version": artifact.get("version"),
                            "fix_versions": fix_versions,
                            "cvss_score": cvss_score,
                            "epss_score": epss_score,
                            "in_kev": in_kev,
                            "blocking": is_blocking,
                            "blocking_reason": reason,
                        },
                    )
                )

            duration = int((time.time() - start) * 1000)

            # Add enrichment stats to raw output
            enriched_data = {
                **data,
                "enrichment": {
                    "kev_catalog_size": len(kev_catalog),
                    "epss_scores_fetched": len(epss_scores),
                    "kev_matches": sum(1 for f in findings if f.metadata.get("in_kev")),
                },
            }

            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL if has_blocking else ControlStatus.PASS,
                findings=findings,
                duration_ms=duration,
                raw_output=enriched_data,
            )

        except json.JSONDecodeError as e:
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                error=f"Failed to parse vulnerability results: {e}",
                duration_ms=int((time.time() - start) * 1000),
            )

    def _calculate_severity(
        self,
        grype_severity: str,
        cvss_score: float | None,
        epss_score: float | None,
        in_kev: bool,
    ) -> tuple[Severity, bool, str]:
        """Calculate severity and blocking status using MTF logic.

        Returns (severity, is_blocking, reason).

        MTF blocking criteria:
        - KEV match = CRITICAL (actively exploited)
        - CVSS 9.0+ = CRITICAL
        - CVSS 7.0-8.9 + EPSS >10% = HIGH (blocks)
        - CVSS 7.0-8.9 + EPSS <=10% = MEDIUM (does not block)
        """
        # KEV match always escalates to CRITICAL
        if in_kev:
            return Severity.CRITICAL, True, "KEV: actively exploited"

        # Use CVSS score if available
        if cvss_score is not None:
            if cvss_score >= 9.0:
                return Severity.CRITICAL, True, f"CVSS {cvss_score:.1f}"

            if cvss_score >= 7.0:
                # High severity: check EPSS for blocking decision
                if epss_score is not None and epss_score > EPSS_ESCALATION_THRESHOLD:
                    return (
                        Severity.HIGH,
                        True,
                        f"CVSS {cvss_score:.1f} + EPSS {epss_score:.1%}",
                    )
                elif epss_score is not None:
                    # High CVSS but low exploitation probability
                    return (
                        Severity.MEDIUM,
                        False,
                        f"CVSS {cvss_score:.1f}, EPSS {epss_score:.1%} (low exploit probability)",
                    )
                else:
                    # No EPSS data, fall back to blocking on HIGH
                    return Severity.HIGH, True, f"CVSS {cvss_score:.1f} (no EPSS data)"

            if cvss_score >= 4.0:
                return Severity.MEDIUM, False, f"CVSS {cvss_score:.1f}"

            return Severity.LOW, False, f"CVSS {cvss_score:.1f}"

        # Fallback to Grype severity if no CVSS score
        if grype_severity == "critical":
            return Severity.CRITICAL, True, "Grype: critical"
        elif grype_severity == "high":
            return Severity.HIGH, True, "Grype: high"
        elif grype_severity == "medium":
            return Severity.MEDIUM, False, "Grype: medium"
        elif grype_severity == "low":
            return Severity.LOW, False, "Grype: low"
        else:
            return Severity.INFO, False, ""
