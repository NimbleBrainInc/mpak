"""CQ-01: No Embedded Secrets control."""

import json
import subprocess
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Files that commonly trigger false positives
FALSE_POSITIVE_PATTERNS = [
    "networks.py",  # pydantic URL validation
    "_urls.py",  # httpx URL parsing
    "url.py",  # urllib3 URL parsing
    "url_attributes.py",  # opentelemetry semconv
    "/test",  # test files
    "/tests/",  # test directories
    "example",  # example files
]

# Detectors that often false-positive on library code
NOISY_DETECTORS_IN_DEPS = ["URI"]


@ControlRegistry.register
class CQ01NoEmbeddedSecrets(Control):
    """CQ-01: No Embedded Secrets.

    Requirement: The bundle MUST NOT contain embedded secrets, credentials,
    API keys, or tokens.
    """

    id = "CQ-01"
    name = "No Embedded Secrets"
    domain = "code_quality"
    description = "Detect embedded secrets, credentials, API keys, and tokens"
    level = 1

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()

        try:
            result = subprocess.run(
                ["trufflehog", "filesystem", str(bundle_dir), "--json", "--no-update"],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError:
            return self.error("trufflehog not found. Install with: brew install trufflehog")
        except subprocess.TimeoutExpired:
            return self.error("Secret scanning timed out")

        duration = int((time.time() - start) * 1000)

        findings: list[Finding] = []
        has_verified_secret = False

        if result.stdout.strip():
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    secret = json.loads(line)
                    detector = secret.get("DetectorName", "unknown")
                    file_path = (
                        secret.get("SourceMetadata", {}).get("Data", {}).get("Filesystem", {}).get("file", "unknown")
                    )

                    in_deps = "/deps/" in file_path

                    # Skip known false positives
                    if detector in NOISY_DETECTORS_IN_DEPS and in_deps:
                        continue
                    if any(pattern in file_path for pattern in FALSE_POSITIVE_PATTERNS):
                        continue

                    verified = secret.get("Verified", False)
                    if verified:
                        has_verified_secret = True
                        severity = Severity.CRITICAL
                    else:
                        severity = Severity.HIGH

                    # Redact the actual secret value
                    raw_value = secret.get("Raw", "")
                    redacted = raw_value[:10] + "..." if raw_value else ""

                    findings.append(
                        Finding(
                            id=f"CQ-01-{len(findings):04d}",
                            control=self.id,
                            severity=severity,
                            title=f"Secret detected: {detector}",
                            description=f"{'Verified' if verified else 'Potential'} secret found",
                            file=file_path,
                            in_deps=in_deps,
                            remediation="Remove the secret and rotate the credential immediately",
                            metadata={
                                "detector": detector,
                                "verified": verified,
                                "redacted_value": redacted,
                            },
                        )
                    )
                except json.JSONDecodeError:
                    continue

        # Fail if any verified secrets or secrets in server code
        server_secrets = [f for f in findings if not f.in_deps]
        if has_verified_secret or server_secrets:
            status = ControlStatus.FAIL
        else:
            status = ControlStatus.PASS

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=status,
            findings=findings,
            duration_ms=duration,
        )
