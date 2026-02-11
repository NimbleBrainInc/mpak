"""SC-04: Lockfile Integrity control.

Per MTF v0.1, SC-04 is CLIENT-ENFORCED. The scanner provides informational
findings about lockfile presence, but the actual integrity verification
happens at install time when clients verify installed deps match the lockfile.
"""

import json
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry, EnforcementContext
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Lock files with their expected integrity hash format
LOCK_FILES_WITH_INTEGRITY = {
    # Python
    "uv.lock": "sha256",  # uv.lock uses sha256 hashes
    "poetry.lock": "sha256",  # poetry uses sha256
    "Pipfile.lock": "sha256",  # pipenv uses sha256
    # Node.js
    "package-lock.json": "sha512",  # npm uses sha512 in integrity field
    "yarn.lock": "sha512",  # yarn uses sha512
    "pnpm-lock.yaml": "sha512",  # pnpm uses sha512
    # Rust
    "Cargo.lock": "checksum",  # Cargo.lock has checksum field
}


@ControlRegistry.register
class SC04LockfileIntegrity(Control):
    """SC-04: Lockfile Integrity.

    Per MTF v0.1, this is a CLIENT-ENFORCED control. The scanner provides
    informational findings about lockfile presence to help publishers,
    but the actual requirement is for clients to verify at install time.

    Scanner checks (informational):
    1. Whether a lockfile exists in the bundle
    2. Whether the lockfile contains integrity/hash information

    Client enforcement (required for L2+):
    - Clients MUST verify installed dependencies match bundle lockfile
    - Hash mismatches MUST block installation
    """

    id = "SC-04"
    name = "Lockfile Integrity"
    domain = "supply_chain"
    description = "Verify lockfile exists with integrity hashes"
    level = 2
    enforcement = EnforcementContext.CLIENT

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Find lockfiles
        lockfiles_found: list[tuple[str, Path]] = []
        for lock_file in LOCK_FILES_WITH_INTEGRITY:
            lock_path = bundle_dir / lock_file
            if lock_path.exists():
                lockfiles_found.append((lock_file, lock_path))

        # Also check deps/ directory for lockfiles
        deps_dir = bundle_dir / "deps"
        if deps_dir.exists():
            for lock_file in LOCK_FILES_WITH_INTEGRITY:
                lock_path = deps_dir / lock_file
                if lock_path.exists():
                    lockfiles_found.append((f"deps/{lock_file}", lock_path))

        if not lockfiles_found:
            # Per MTF spec, SC-04 is client-enforced. Scanner provides informational
            # finding but does not block. Clients verify at install time.
            findings.append(
                Finding(
                    id="SC-04-0001",
                    control=self.id,
                    severity=Severity.INFO,
                    title="No lockfile found",
                    description="Bundle does not contain a lockfile. Lockfiles enable "
                    "clients to verify dependency integrity at install time. "
                    "Consider adding one for L2+ compliance.",
                    remediation="Add a lockfile (uv.lock, package-lock.json, etc.) to the bundle",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.PASS,  # Informational - client enforces at install
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        # Check each lockfile for integrity hashes
        for lock_name, lock_path in lockfiles_found:
            self._check_lockfile_integrity(lock_name, lock_path, findings)

        duration = int((time.time() - start) * 1000)

        # SC-04 is client-enforced per MTF spec - scanner always passes with info findings
        # Add success finding
        findings.insert(
            0,
            Finding(
                id="SC-04-0000",
                control=self.id,
                severity=Severity.INFO,
                title=f"Lockfile found: {', '.join(lf[0] for lf in lockfiles_found)}",
                description="Lockfile(s) present for client-side integrity verification",
            ),
        )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.PASS,  # Client-enforced - scanner is informational only
            findings=findings,
            duration_ms=duration,
        )

    def _check_lockfile_integrity(self, lock_name: str, lock_path: Path, findings: list[Finding]) -> None:
        """Check a lockfile for integrity hashes."""
        try:
            content = lock_path.read_text()
        except Exception as e:
            findings.append(
                Finding(
                    id="SC-04-0002",
                    control=self.id,
                    severity=Severity.LOW,
                    title=f"Could not read lockfile: {lock_name}",
                    description=str(e),
                    file=lock_name,
                )
            )
            return

        if lock_name.endswith("package-lock.json"):
            self._check_npm_lockfile(lock_name, content, findings)
        elif lock_name.endswith("uv.lock"):
            self._check_uv_lockfile(lock_name, content, findings)
        elif lock_name.endswith("poetry.lock"):
            self._check_poetry_lockfile(lock_name, content, findings)
        elif lock_name.endswith("Cargo.lock"):
            self._check_cargo_lockfile(lock_name, content, findings)
        elif lock_name.endswith("yarn.lock"):
            self._check_yarn_lockfile(lock_name, content, findings)
        elif lock_name.endswith("pnpm-lock.yaml"):
            self._check_pnpm_lockfile(lock_name, content, findings)
        elif lock_name.endswith("Pipfile.lock"):
            self._check_pipfile_lockfile(lock_name, content, findings)

    def _check_npm_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check npm package-lock.json for integrity hashes."""
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            findings.append(
                Finding(
                    id="SC-04-0003",
                    control=self.id,
                    severity=Severity.LOW,
                    title=f"Invalid JSON in {lock_name}",
                    description=str(e),
                    file=lock_name,
                )
            )
            return

        # Check lockfileVersion
        version = data.get("lockfileVersion", 1)
        if version < 2:
            findings.append(
                Finding(
                    id="SC-04-0004",
                    control=self.id,
                    severity=Severity.LOW,
                    title="Old lockfile version",
                    description=f"{lock_name} uses lockfileVersion {version}. "
                    "Version 2+ provides better integrity guarantees.",
                    file=lock_name,
                    remediation="Run 'npm install' with npm 7+ to upgrade lockfile",
                )
            )

        # Check packages for integrity field
        packages = data.get("packages", {})
        missing_integrity = []
        for pkg_path, pkg_info in packages.items():
            if pkg_path == "":  # Root package
                continue
            if "integrity" not in pkg_info and not pkg_info.get("link"):
                missing_integrity.append(pkg_path)

        if missing_integrity:
            findings.append(
                Finding(
                    id="SC-04-0005",
                    control=self.id,
                    severity=Severity.LOW,
                    title=f"{len(missing_integrity)} packages missing integrity hashes",
                    description=f"Packages without integrity: {', '.join(missing_integrity[:5])}"
                    + (f" and {len(missing_integrity) - 5} more" if len(missing_integrity) > 5 else ""),
                    file=lock_name,
                    remediation="Run 'npm install' to regenerate lockfile with integrity hashes",
                )
            )

    def _check_uv_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check uv.lock for hash information."""
        if "hash = " not in content and "sha256 = " not in content:
            findings.append(
                Finding(
                    id="SC-04-0006",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No hashes found in uv.lock",
                    description="uv.lock should contain SHA256 hashes for wheels",
                    file=lock_name,
                    remediation="Regenerate lockfile with 'uv lock'",
                )
            )

    def _check_poetry_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check poetry.lock for hash information."""
        if "hash = " not in content:
            findings.append(
                Finding(
                    id="SC-04-0007",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No hashes found in poetry.lock",
                    description="poetry.lock should contain hashes for package files",
                    file=lock_name,
                    remediation="Regenerate lockfile with 'poetry lock'",
                )
            )

    def _check_cargo_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check Cargo.lock for checksum information."""
        if "checksum = " not in content:
            findings.append(
                Finding(
                    id="SC-04-0008",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No checksums found in Cargo.lock",
                    description="Cargo.lock should contain checksums for packages",
                    file=lock_name,
                    remediation="Regenerate lockfile with 'cargo update'",
                )
            )

    def _check_yarn_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check yarn.lock for integrity information."""
        if "integrity " not in content and "sha512-" not in content:
            findings.append(
                Finding(
                    id="SC-04-0009",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No integrity hashes found in yarn.lock",
                    description="yarn.lock should contain integrity hashes",
                    file=lock_name,
                    remediation="Regenerate lockfile with 'yarn install'",
                )
            )

    def _check_pnpm_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check pnpm-lock.yaml for integrity information."""
        if "integrity: " not in content:
            findings.append(
                Finding(
                    id="SC-04-0010",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No integrity hashes found in pnpm-lock.yaml",
                    description="pnpm-lock.yaml should contain integrity hashes",
                    file=lock_name,
                    remediation="Regenerate lockfile with 'pnpm install'",
                )
            )

    def _check_pipfile_lockfile(self, lock_name: str, content: str, findings: list[Finding]) -> None:
        """Check Pipfile.lock for hash information."""
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            findings.append(
                Finding(
                    id="SC-04-0011",
                    control=self.id,
                    severity=Severity.LOW,
                    title=f"Invalid JSON in {lock_name}",
                    description=str(e),
                    file=lock_name,
                )
            )
            return

        # Check default and develop sections for hashes
        missing_hashes = []
        for section in ["default", "develop"]:
            packages = data.get(section, {})
            for pkg_name, pkg_info in packages.items():
                if "hashes" not in pkg_info or not pkg_info["hashes"]:
                    missing_hashes.append(pkg_name)

        if missing_hashes:
            findings.append(
                Finding(
                    id="SC-04-0012",
                    control=self.id,
                    severity=Severity.LOW,
                    title=f"{len(missing_hashes)} packages missing hashes",
                    description=f"Packages without hashes: {', '.join(missing_hashes[:5])}"
                    + (f" and {len(missing_hashes) - 5} more" if len(missing_hashes) > 5 else ""),
                    file=lock_name,
                    remediation="Run 'pipenv lock' to regenerate lockfile with hashes",
                )
            )
