"""CQ-03: Static Analysis Clean control."""

import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity


class ToolFailureError(Exception):
    """A static-analysis tool could not produce a result.

    Raised instead of returning no findings, so the control reports ERROR
    rather than certifying the bundle on an analysis that never ran.
    """


# Directories that contain dependencies (not server code)
DEP_DIRS = ["deps", "node_modules", "vendor", "site-packages", ".venv", "venv"]

# JavaScript/TypeScript file extensions
JS_EXTENSIONS = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"}

# Bandit severity/confidence mapping
BANDIT_SEVERITY_MAP = {
    ("HIGH", "HIGH"): Severity.HIGH,
    ("HIGH", "MEDIUM"): Severity.MEDIUM,
    ("MEDIUM", "HIGH"): Severity.MEDIUM,
    ("MEDIUM", "MEDIUM"): Severity.LOW,
    ("LOW", "HIGH"): Severity.LOW,
    ("LOW", "MEDIUM"): Severity.INFO,
    ("LOW", "LOW"): Severity.INFO,
    ("HIGH", "LOW"): Severity.MEDIUM,
    ("MEDIUM", "LOW"): Severity.LOW,
}

# ESLint severity mapping (2=error, 1=warning)
ESLINT_SEVERITY_MAP = {
    2: Severity.HIGH,
    1: Severity.MEDIUM,
}


@ControlRegistry.register
class CQ03StaticAnalysis(Control):
    """CQ-03: Static Analysis Clean.

    Requirement: The bundle's server code (excluding dependencies) MUST pass
    static security analysis with no high-severity findings.
    """

    id = "CQ-03"
    name = "Static Analysis Clean"
    domain = "code_quality"
    description = "Run static security analysis on server code"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Find files for each language (excluding dependencies)
        python_files = self._find_server_python_files(bundle_dir)
        js_files = self._find_server_js_files(bundle_dir)

        # Track if any analysis was run
        analysis_run = False

        try:
            if python_files:
                findings.extend(self._run_bandit(bundle_dir, python_files))
                analysis_run = True

            if js_files:
                findings.extend(self._run_eslint(bundle_dir, js_files))
                analysis_run = True
        except ToolFailureError as e:
            return self.error(str(e), duration_ms=int((time.time() - start) * 1000))

        if not analysis_run:
            # No server code files to analyze
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.PASS,
                findings=[
                    Finding(
                        id="CQ-03-0000",
                        control=self.id,
                        severity=Severity.INFO,
                        title="No server code found",
                        description="No Python or JavaScript files to analyze (excluding dependencies)",
                    )
                ],
                duration_ms=int((time.time() - start) * 1000),
            )

        duration = int((time.time() - start) * 1000)

        # Determine pass/fail: fail if any HIGH severity findings in server code
        has_high_in_server = any(f.severity == Severity.HIGH and not f.in_deps for f in findings)

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if has_high_in_server else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
        )

    def _find_server_python_files(self, bundle_dir: Path) -> list[Path]:
        """Find Python files that are server code (not dependencies)."""
        python_files: list[Path] = []

        for py_file in bundle_dir.rglob("*.py"):
            relative = py_file.relative_to(bundle_dir)
            path_str = str(relative)

            # Skip dependency directories
            is_dep = any(dep_dir in path_str for dep_dir in DEP_DIRS)
            if is_dep:
                continue

            # Skip test files
            if "test" in path_str.lower() or "spec" in path_str.lower():
                continue

            python_files.append(py_file)

        return python_files

    def _find_server_js_files(self, bundle_dir: Path) -> list[Path]:
        """Find JavaScript/TypeScript files that are server code (not dependencies)."""
        js_files: list[Path] = []

        for ext in JS_EXTENSIONS:
            for js_file in bundle_dir.rglob(f"*{ext}"):
                relative = js_file.relative_to(bundle_dir)
                path_str = str(relative)

                # Skip dependency directories
                is_dep = any(dep_dir in path_str for dep_dir in DEP_DIRS)
                if is_dep:
                    continue

                # Skip test files
                if "test" in path_str.lower() or "spec" in path_str.lower():
                    continue

                js_files.append(js_file)

        return js_files

    def _run_bandit(self, bundle_dir: Path, python_files: list[Path]) -> list[Finding]:
        """Run Bandit static analysis on Python files."""
        findings: list[Finding] = []

        # Create a file list for Bandit
        file_list = [str(f) for f in python_files]

        bandit = shutil.which("bandit")
        if bandit is None:
            raise ToolFailureError("bandit not found; Python static analysis did not run")

        try:
            # Absolute paths are passed, so no cwd is needed. Running inside the
            # bundle would let it influence tool resolution and configuration.
            result = subprocess.run(
                [bandit, "-f", "json", "-r", "--exit-zero"] + file_list,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError as e:
            raise ToolFailureError("bandit not found; Python static analysis did not run") from e
        except subprocess.TimeoutExpired as e:
            # A timeout means the analysis did not finish, so its findings are
            # unknown rather than absent -- the same reasoning as every other
            # tool failure here.
            raise ToolFailureError("bandit analysis timed out") from e

        # Bandit runs with --exit-zero, so findings never set the exit code.
        # Any non-zero status is therefore an internal failure.
        if result.returncode != 0:
            raise ToolFailureError(result.stderr.strip() or "bandit exited with an error")
        if not result.stdout.strip():
            raise ToolFailureError("bandit produced no output")

        try:
            if result.stdout.strip():
                data = json.loads(result.stdout)
                results = data.get("results", [])

                for i, issue in enumerate(results):
                    severity_str = issue.get("issue_severity", "LOW")
                    confidence_str = issue.get("issue_confidence", "LOW")

                    # Map Bandit severity/confidence to MTF severity
                    mbss_severity = BANDIT_SEVERITY_MAP.get((severity_str, confidence_str), Severity.INFO)

                    file_path = issue.get("filename", "unknown")
                    # Make path relative to bundle
                    try:
                        rel_path = str(Path(file_path).relative_to(bundle_dir))
                    except ValueError:
                        rel_path = file_path

                    # Check if in deps
                    in_deps = any(dep_dir in rel_path for dep_dir in DEP_DIRS)

                    findings.append(
                        Finding(
                            id=f"CQ-03-{i + 1:04d}",
                            control=self.id,
                            severity=mbss_severity,
                            title=f"{issue.get('test_id', 'B000')}: {issue.get('issue_text', 'Unknown issue')}",
                            description=issue.get("issue_text", ""),
                            file=rel_path,
                            line=issue.get("line_number"),
                            in_deps=in_deps,
                            remediation=f"See: https://bandit.readthedocs.io/en/latest/plugins/{issue.get('test_id', '').lower()}.html",
                            metadata={
                                "test_id": issue.get("test_id"),
                                "test_name": issue.get("test_name"),
                                "severity": severity_str,
                                "confidence": confidence_str,
                            },
                        )
                    )

        except json.JSONDecodeError as e:
            raise ToolFailureError(f"Could not parse bandit output: {e}") from e

        return findings

    def _run_eslint(self, bundle_dir: Path, js_files: list[Path]) -> list[Finding]:
        """Run ESLint static analysis on JavaScript/TypeScript files."""
        findings: list[Finding] = []

        if not js_files:
            return findings

        # Create a file list for ESLint
        file_list = [str(f) for f in js_files]

        # Resolve ESLint from PATH, never via npx. npx prefers
        # ./node_modules/.bin, so a bundle shipping its own `eslint` would have
        # its binary executed by the scan pod -- which holds the S3 credentials
        # and the callback secret, and could forge a clean result.
        eslint = shutil.which("eslint")
        if eslint is None:
            raise ToolFailureError("eslint not found; JavaScript static analysis did not run")

        try:
            result = subprocess.run(
                [
                    eslint,
                    "--no-config-lookup",
                    "--plugin",
                    "eslint-plugin-security",
                    "--rule",
                    "security/detect-child-process: error",
                    "--rule",
                    "security/detect-eval-with-expression: error",
                    "--rule",
                    "security/detect-non-literal-fs-filename: warn",
                    "--rule",
                    "security/detect-non-literal-regexp: warn",
                    "--rule",
                    "security/detect-object-injection: warn",
                    "--rule",
                    "security/detect-possible-timing-attacks: warn",
                    "--format",
                    "json",
                    *file_list,
                ],
                capture_output=True,
                text=True,
                timeout=120,
                # With --no-config-lookup, ESLint treats the working directory as
                # the flat-config base path and silently ignores any file outside
                # it. Anchor at the filesystem root so every absolute path is in
                # scope. It must not be the bundle directory: that is what let a
                # bundle supply its own tooling and configuration.
                cwd=bundle_dir.anchor or "/",
            )
        except FileNotFoundError as e:
            raise ToolFailureError("eslint not found; JavaScript static analysis did not run") from e
        except subprocess.TimeoutExpired as e:
            raise ToolFailureError("eslint analysis timed out") from e

        # ESLint exits 0 with no findings, 1 with findings, and 2 on an internal
        # error -- a broken config, an unresolvable plugin, an unusable flag.
        # Only 2 means nothing was analysed.
        if result.returncode >= 2:
            raise ToolFailureError(result.stderr.strip() or "eslint exited with an internal error")
        if not result.stdout.strip():
            raise ToolFailureError("eslint produced no output")

        try:
            if result.stdout.strip():
                data = json.loads(result.stdout)

                finding_counter = 0
                for file_result in data:
                    file_path = file_result.get("filePath", "unknown")
                    # Make path relative to bundle
                    try:
                        rel_path = str(Path(file_path).relative_to(bundle_dir))
                    except ValueError:
                        rel_path = file_path

                    # Check if in deps
                    in_deps = any(dep_dir in rel_path for dep_dir in DEP_DIRS)

                    for msg in file_result.get("messages", []):
                        # A message with no rule is ESLint talking about itself
                        # rather than about the code -- an ignored file, an
                        # unresolvable config. Nothing was analysed, so it cannot
                        # be reported as a finding. The exception is `fatal`,
                        # which marks a file ESLint could not parse: that is a
                        # property of the bundle and stays a finding.
                        if msg.get("ruleId") is None and not msg.get("fatal"):
                            raise ToolFailureError(f"eslint analysed nothing: {msg.get('message', 'no rule reported')}")

                        finding_counter += 1
                        severity_int = msg.get("severity", 1)
                        mtf_severity = ESLINT_SEVERITY_MAP.get(severity_int, Severity.LOW)

                        rule_id = msg.get("ruleId") or "unknown"
                        message = msg.get("message", "Unknown issue")

                        findings.append(
                            Finding(
                                id=f"CQ-03-JS-{finding_counter:04d}",
                                control=self.id,
                                severity=mtf_severity,
                                title=f"{rule_id}: {message}",
                                description=message,
                                file=rel_path,
                                line=msg.get("line"),
                                in_deps=in_deps,
                                remediation="See: https://github.com/eslint-community/eslint-plugin-security#rules",
                                metadata={
                                    "ruleId": rule_id,
                                    "severity": severity_int,
                                },
                            )
                        )

        except json.JSONDecodeError as e:
            raise ToolFailureError(f"Could not parse eslint output: {e}") from e

        return findings
