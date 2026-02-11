"""CQ-05: Safe Execution Patterns control."""

import re
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity
from mpak_scanner.rules import load_rules

# Dependency directories to exclude
DEP_DIRS = ["deps", "node_modules", "vendor", "site-packages", ".venv", "venv"]

# File extensions by language
PYTHON_EXTENSIONS = {".py"}
JS_EXTENSIONS = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"}

# Severity mapping from YAML strings
SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
    "info": Severity.INFO,
}

# Exclusion patterns (nosec comments, test files)
EXCLUSION_PATTERNS = [
    r"#\s*nosec",
    r"//\s*nosec",
    r"/\*\s*nosec",
    r"#\s*Safe:",
]


@ControlRegistry.register
class CQ05SafeExecution(Control):
    """CQ-05: Safe Execution Patterns.

    Requirement: The bundle MUST NOT use unsafe code execution patterns
    in server code that could enable injection attacks.
    """

    id = "CQ-05"
    name = "Safe Execution Patterns"
    domain = "code_quality"
    description = "Detect unsafe code execution patterns (shell injection, eval, etc.)"
    level = 3

    def __init__(self) -> None:
        super().__init__()
        self._patterns = self._load_patterns()

    def _load_patterns(self) -> dict[str, list[dict[str, Any]]]:
        """Load patterns from bundled rules/unsafe-exec.yaml."""
        data = load_rules("unsafe-exec.yaml")
        return {
            "python": data.get("python", []),
            "javascript": data.get("javascript", []),
        }

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Scan Python files
        python_patterns = self._patterns.get("python", [])
        for py_file in self._find_files(bundle_dir, PYTHON_EXTENSIONS):
            self._scan_file(py_file, bundle_dir, python_patterns, findings)

        # Scan JavaScript/TypeScript files
        js_patterns = self._patterns.get("javascript", [])
        for js_file in self._find_files(bundle_dir, JS_EXTENSIONS):
            self._scan_file(js_file, bundle_dir, js_patterns, findings)

        duration = int((time.time() - start) * 1000)

        # Fail if any HIGH or CRITICAL findings in server code
        has_severe_in_server = any(f.severity in (Severity.HIGH, Severity.CRITICAL) and not f.in_deps for f in findings)

        if not findings:
            findings.append(
                Finding(
                    id="CQ-05-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title="No unsafe execution patterns detected",
                    description="Server code passed safe execution pattern analysis",
                )
            )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if has_severe_in_server else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
        )

    def _find_files(self, bundle_dir: Path, extensions: set[str]) -> list[Path]:
        """Find server code files with given extensions."""
        files: list[Path] = []

        for ext in extensions:
            for file in bundle_dir.rglob(f"*{ext}"):
                try:
                    relative = str(file.relative_to(bundle_dir))
                except ValueError:
                    continue

                # Skip dependencies
                if any(dep in relative for dep in DEP_DIRS):
                    continue

                # Skip tests
                if "test" in relative.lower() or "spec" in relative.lower():
                    continue

                files.append(file)

        return files

    def _scan_file(
        self,
        file_path: Path,
        bundle_dir: Path,
        patterns: list[dict[str, Any]],
        findings: list[Finding],
    ) -> None:
        """Scan a file for unsafe patterns."""
        try:
            content = file_path.read_text()
        except Exception:
            return

        try:
            relative_path = str(file_path.relative_to(bundle_dir))
        except ValueError:
            relative_path = str(file_path)

        in_deps = any(dep in relative_path for dep in DEP_DIRS)

        for line_num, line in enumerate(content.splitlines(), start=1):
            # Check for exclusion comments
            if self._is_excluded(line):
                continue

            for pattern_def in patterns:
                pattern = pattern_def.get("pattern", "")
                if not pattern:
                    continue

                try:
                    if re.search(pattern, line, re.IGNORECASE):
                        severity_str = pattern_def.get("severity", "medium").lower()
                        severity = SEVERITY_MAP.get(severity_str, Severity.MEDIUM)

                        findings.append(
                            Finding(
                                id=f"CQ-05-{len(findings) + 1:04d}",
                                control=self.id,
                                severity=severity,
                                title=pattern_def.get("name", pattern_def.get("id", "Unsafe pattern")),
                                description=pattern_def.get("description", "Unsafe execution pattern detected"),
                                file=relative_path,
                                line=line_num,
                                in_deps=in_deps,
                                remediation=pattern_def.get("remediation"),
                                metadata={"pattern_id": pattern_def.get("id")},
                            )
                        )
                except re.error:
                    # Skip invalid regex patterns
                    continue

    def _is_excluded(self, line: str) -> bool:
        """Check if a line should be excluded from analysis."""
        return any(re.search(p, line) for p in EXCLUSION_PATTERNS)
