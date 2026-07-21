"""CQ-02: No Malicious Patterns control."""

import json
import subprocess
import sys
import time
from pathlib import Path, PurePosixPath
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# File extensions for detecting bundle language
PYTHON_EXTENSIONS = {".py"}
JS_EXTENSIONS = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"}

# Directories to skip when detecting language
SKIP_DIRS = {"deps", "node_modules", "vendor", "site-packages", ".venv", "venv", "__pycache__"}

# GuardDog names rules by intent. `capability-*` states what code is able to do
# -- open a socket, read a file, spawn a process -- which is a description, not
# an accusation. Every MCP server trips several by existing. Only `threat-*`
# rules are a verdict, and only those can fail this control. What a server is
# able to do is the capability-declaration domain's question, not malware's.
CAPABILITY_RULE_PREFIX = "capability-"

# Threat rules that fire on ordinary MCP server behaviour, reported but not
# blocking. Reading credentials from the environment is the mechanism the
# manifest's user_config describes, and calling third-party APIs over TLS is
# what a server wrapping an API does. Malicious use of either shows up in the
# rules that describe the malicious part -- exfiltration, obfuscation, spawning
# a shell -- which stay blocking.
NON_BLOCKING_THREAT_RULES = {
    "threat-runtime-environment-read",
    "threat-network-outbound-shady-links",
    "threat-runtime-obfuscation-unicode",
}


def _is_dependency_path(path: str) -> bool:
    """Whether a tool-reported path points into vendored dependency code.

    Reported so a publisher can tell their own code from what they vendor. It
    deliberately does not affect the verdict: the layout is author-controlled,
    so a payload dropped into a directory named `vendor` would exempt itself.
    """
    return any(part in SKIP_DIRS for part in PurePosixPath(path).parts)


@ControlRegistry.register
class CQ02NoMaliciousPatterns(Control):
    """CQ-02: No Malicious Patterns.

    Requirement: The bundle MUST NOT contain code patterns associated with
    malware, data exfiltration, or supply chain attacks.

    Supports both Python (via guarddog pypi) and Node.js (via guarddog npm).
    """

    id = "CQ-02"
    name = "No Malicious Patterns"
    domain = "code_quality"
    description = "Detect malware, data exfiltration, and supply chain attack patterns"
    level = 1

    def _detect_ecosystem(self, bundle_dir: Path) -> str | None:
        """Detect the primary ecosystem of the bundle.

        Returns 'pypi' for Python, 'npm' for Node.js, or None if unknown.
        """
        has_python = False
        has_js = False

        for path in bundle_dir.rglob("*"):
            if not path.is_file():
                continue

            # Skip dependency directories
            if any(skip_dir in path.parts for skip_dir in SKIP_DIRS):
                continue

            suffix = path.suffix.lower()
            if suffix in PYTHON_EXTENSIONS:
                has_python = True
            elif suffix in JS_EXTENSIONS:
                has_js = True

            # Early exit if we found both (prefer Python for mixed bundles)
            if has_python and has_js:
                break

        # Check for package.json as strong Node.js indicator
        if (bundle_dir / "package.json").exists():
            has_js = True

        # Prefer Python if both exist (rare case)
        if has_python:
            return "pypi"
        elif has_js:
            return "npm"
        return None

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()

        # Detect ecosystem
        ecosystem = self._detect_ecosystem(bundle_dir)
        if ecosystem is None:
            # A property of the bundle, not a scanner failure: `binary` is a
            # supported server type with no Python or JavaScript to analyse.
            # SKIP says the control had nothing to inspect, where ERROR would
            # claim the scanner could not measure and suppress the whole scan.
            return self.skip("No Python or JavaScript files found to analyse")

        try:
            # Use python -m guarddog to ensure we use the venv's guarddog
            result = subprocess.run(
                [sys.executable, "-m", "guarddog", ecosystem, "scan", str(bundle_dir), "--output-format", "json"],
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes for large bundles with many deps
            )
        except FileNotFoundError:
            return self.error("Python interpreter not found")
        except subprocess.TimeoutExpired:
            return self.error("Malicious pattern scan timed out")

        duration = int((time.time() - start) * 1000)

        # GuardDog emits a JSON document on every successful run, including a
        # clean one. Empty output therefore means it analysed nothing, whatever
        # the exit code says, and passing here would certify the bundle free of
        # malicious patterns on the strength of a scan that never ran.
        if not result.stdout.strip():
            return self.error(
                result.stderr.strip() or "Malicious pattern scan produced no output", duration_ms=duration
            )

        findings: list[Finding] = []

        server_code_findings = 0

        try:
            if result.stdout.strip():
                data = json.loads(result.stdout)

                # GuardDog reports engine failures in-band: it exits zero and
                # emits a full document whose `errors` map explains that rules
                # did not run, while `results` sits empty. Non-empty output is
                # therefore not evidence that anything was analysed, and an
                # empty `results` under those conditions means "unknown", not
                # "clean" -- the one answer this control must never guess at.
                if isinstance(data, dict) and data.get("errors"):
                    return self.error(
                        f"GuardDog analysis failed: {json.dumps(data['errors'])[:500]}",
                        duration_ms=duration,
                    )

                if isinstance(data, dict):
                    for rule_name, rule_findings in data.get("results", {}).items():
                        if rule_findings:
                            for finding in rule_findings:
                                file_path = finding.get("location", "unknown")
                                in_deps = _is_dependency_path(file_path)

                                # Per MTF spec, CQ-02 only evaluates server code
                                # Findings in dependencies are informational only
                                # Severity comes from the rule, never from where
                                # the file sits. A bundle ships and executes the
                                # code it vendors, so an obfuscated exec or an
                                # exfiltration pattern is its problem wherever it
                                # lives -- and a directory whose name the author
                                # chose is not a boundary anything can rest on.
                                if rule_name.startswith(CAPABILITY_RULE_PREFIX):
                                    # A capability the server has, not a threat.
                                    severity = Severity.INFO
                                elif rule_name in NON_BLOCKING_THREAT_RULES:
                                    severity = Severity.MEDIUM
                                else:
                                    severity = Severity.CRITICAL
                                    server_code_findings += 1

                                findings.append(
                                    Finding(
                                        id=f"CQ-02-{len(findings):04d}",
                                        control=self.id,
                                        severity=severity,
                                        title=f"Malicious pattern: {rule_name}",
                                        description=finding.get("message", "Suspicious code pattern detected"),
                                        file=file_path,
                                        in_deps=in_deps,
                                        remediation="Review the code and remove malicious patterns",
                                        metadata={
                                            "rule": rule_name,
                                            "ecosystem": ecosystem,
                                        },
                                    )
                                )

        except json.JSONDecodeError as e:
            # Unparseable output means the results are unknown, not empty.
            return self.error(f"Failed to parse malicious pattern results: {e}", duration_ms=duration)

        # Only fail on findings in server code, not dependencies
        # Dependency findings are informational (INFO severity)
        if server_code_findings > 0:
            status = ControlStatus.FAIL
        else:
            status = ControlStatus.PASS

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=status,
            findings=findings,
            duration_ms=duration,
            raw_output={"ecosystem": ecosystem},
        )
