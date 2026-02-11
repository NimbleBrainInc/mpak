"""CQ-02: No Malicious Patterns control."""

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# File extensions for detecting bundle language
PYTHON_EXTENSIONS = {".py"}
JS_EXTENSIONS = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"}

# Directories to skip when detecting language
SKIP_DIRS = {"deps", "node_modules", "vendor", "site-packages", ".venv", "venv", "__pycache__"}

# Rules with high false-positive rate for MCP servers
# These are treated as warnings (MEDIUM) instead of blocking (CRITICAL)
# MCP servers legitimately call external APIs, which triggers these rules
HIGH_FP_RULES = {
    "shady-links",  # Flags .io, .dev, .xyz domains - common for APIs
    "unicode",  # Flags unicode in code - common for i18n
}


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
            return self.error("Could not detect bundle ecosystem (no Python or JavaScript files found)")

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

        findings: list[Finding] = []

        # Determine dependency directory pattern based on ecosystem
        dep_patterns = ["/deps/", "/node_modules/", "/site-packages/", "/vendor/", "deps/"]

        server_code_findings = 0

        try:
            if result.stdout.strip():
                data = json.loads(result.stdout)

                if isinstance(data, dict):
                    for rule_name, rule_findings in data.get("results", {}).items():
                        if rule_findings:
                            for finding in rule_findings:
                                file_path = finding.get("location", "unknown")
                                in_deps = any(pattern in file_path for pattern in dep_patterns)

                                # Per MTF spec, CQ-02 only evaluates server code
                                # Findings in dependencies are informational only
                                if in_deps:
                                    severity = Severity.INFO
                                elif rule_name in HIGH_FP_RULES:
                                    # High false-positive rules are warnings, not blocking
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

        except json.JSONDecodeError:
            # GuardDog might output non-JSON for some errors
            pass

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
