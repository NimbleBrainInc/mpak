"""SC-03: Dependency Pinning control."""

import re
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Lock files that indicate pinned dependencies
LOCK_FILES = [
    # Python
    "uv.lock",
    "poetry.lock",
    "Pipfile.lock",
    "pdm.lock",
    # Node.js
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    # Rust
    "Cargo.lock",
    # Go
    "go.sum",
    # Ruby
    "Gemfile.lock",
]

# Patterns indicating unpinned versions in requirements files
UNPINNED_PATTERNS = [
    (r">=", "Greater than or equal"),
    (r"<=", "Less than or equal"),
    (r">(?!=)", "Greater than"),
    (r"<(?!=)", "Less than"),
    (r"\^", "Caret range"),
    (r"~(?!=)", "Tilde range"),
    (r"\*", "Wildcard"),
    (r"latest", "Latest tag"),
]


@ControlRegistry.register
class SC03DependencyPinning(Control):
    """SC-03: Dependency Pinning.

    Requirement: All dependencies MUST be pinned to specific versions.
    Floating version ranges are not permitted.
    """

    id = "SC-03"
    name = "Dependency Pinning"
    domain = "supply_chain"
    description = "Verify all dependencies are pinned to exact versions"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Check for lock files
        lock_files_found: list[str] = []
        for lock_file in LOCK_FILES:
            if (bundle_dir / lock_file).exists():
                lock_files_found.append(lock_file)

        # Check Python requirements files
        requirements_files = list(bundle_dir.glob("**/requirements*.txt"))
        for req_file in requirements_files:
            self._check_requirements_file(req_file, bundle_dir, findings)

        # Check pyproject.toml for unpinned deps
        pyproject = bundle_dir / "pyproject.toml"
        if pyproject.exists():
            self._check_pyproject(pyproject, bundle_dir, findings)

        # Check package.json for unpinned deps
        package_json = bundle_dir / "package.json"
        if package_json.exists():
            self._check_package_json(package_json, bundle_dir, findings)

        duration = int((time.time() - start) * 1000)

        # Determine pass/fail
        # Pass if: lock file exists OR no unpinned dependencies found
        has_lock_file = len(lock_files_found) > 0
        has_unpinned = any(f.severity in (Severity.HIGH, Severity.CRITICAL) for f in findings)

        if has_unpinned and not has_lock_file:
            status = ControlStatus.FAIL
        else:
            status = ControlStatus.PASS
            if has_lock_file:
                findings.insert(
                    0,
                    Finding(
                        id="SC-03-0000",
                        control=self.id,
                        severity=Severity.INFO,
                        title=f"Lock file found: {', '.join(lock_files_found)}",
                        description="Dependencies are pinned via lock file",
                    ),
                )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=status,
            findings=findings,
            duration_ms=duration,
        )

    def _check_requirements_file(self, req_file: Path, bundle_dir: Path, findings: list[Finding]) -> None:
        """Check a requirements.txt file for unpinned dependencies."""
        relative_path = str(req_file.relative_to(bundle_dir))

        try:
            content = req_file.read_text()
        except Exception:
            return

        for line_num, line in enumerate(content.splitlines(), start=1):
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith("#") or line.startswith("-"):
                continue

            # Check for unpinned patterns
            for pattern, pattern_name in UNPINNED_PATTERNS:
                if re.search(pattern, line):
                    findings.append(
                        Finding(
                            id=f"SC-03-{len(findings) + 1:04d}",
                            control=self.id,
                            severity=Severity.HIGH,
                            title=f"Unpinned dependency: {line.split('[')[0].split('>')[0].split('<')[0].split('~')[0].split('^')[0].strip()}",
                            description=f"Uses {pattern_name} version specifier",
                            file=relative_path,
                            line=line_num,
                            remediation="Pin to exact version (e.g., package==1.2.3)",
                        )
                    )
                    break

    def _check_pyproject(self, pyproject: Path, bundle_dir: Path, findings: list[Finding]) -> None:
        """Check pyproject.toml for unpinned dependencies."""
        try:
            content = pyproject.read_text()
        except Exception:
            return

        # Simple pattern matching for dependencies section
        in_deps_section = False
        for line_num, line in enumerate(content.splitlines(), start=1):
            stripped = line.strip()

            # Track if we're in a dependencies section
            if stripped.startswith("[") and "dependencies" in stripped.lower():
                in_deps_section = True
                continue
            elif stripped.startswith("[") and in_deps_section:
                in_deps_section = False
                continue

            if in_deps_section and "=" in stripped:
                for pattern, pattern_name in UNPINNED_PATTERNS:
                    if re.search(pattern, stripped):
                        # Extract package name
                        pkg_name = stripped.split("=")[0].strip().strip('"').strip("'")
                        findings.append(
                            Finding(
                                id=f"SC-03-{len(findings) + 1:04d}",
                                control=self.id,
                                severity=Severity.LOW,
                                title=f"Unpinned dependency in pyproject.toml: {pkg_name}",
                                description=f"Uses {pattern_name} version specifier (required for L2+)",
                                file="pyproject.toml",
                                line=line_num,
                                remediation="Pin to exact version or use a lock file",
                            )
                        )
                        break

    def _check_package_json(self, package_json: Path, bundle_dir: Path, findings: list[Finding]) -> None:
        """Check package.json for unpinned dependencies."""
        import json

        try:
            data = json.loads(package_json.read_text())
        except Exception:
            return

        deps_sections = ["dependencies", "devDependencies", "peerDependencies"]

        for section in deps_sections:
            deps = data.get(section, {})
            for pkg_name, version in deps.items():
                if not isinstance(version, str):
                    continue

                for pattern, pattern_name in UNPINNED_PATTERNS:
                    if re.search(pattern, version):
                        findings.append(
                            Finding(
                                id=f"SC-03-{len(findings) + 1:04d}",
                                control=self.id,
                                severity=Severity.LOW,
                                title=f"Unpinned dependency: {pkg_name}",
                                description=f"Version '{version}' uses {pattern_name} (required for L2+)",
                                file="package.json",
                                remediation="Pin to exact version or ensure package-lock.json is present",
                            )
                        )
                        break
