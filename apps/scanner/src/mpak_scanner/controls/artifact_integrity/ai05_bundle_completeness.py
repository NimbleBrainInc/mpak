"""AI-05: Bundle Completeness control."""

import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# File extensions considered executable
EXECUTABLE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".mjs",
    ".cjs",
    ".go",
    ".rs",
    ".sh",
    ".bash",
    ".zsh",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
}

# Binary/shell extensions that warrant CRITICAL severity
BINARY_EXTENSIONS = {".exe", ".dll", ".so", ".dylib"}
SHELL_EXTENSIONS = {".sh", ".bash", ".zsh"}

# Always-allowed file patterns (case-insensitive stem matching)
ALWAYS_ALLOWED_STEMS = {"manifest", "readme", "license", "changelog"}

# Always-allowed extensions
ALWAYS_ALLOWED_EXTENSIONS = {".sig"}

# Always-allowed directory prefixes
ALWAYS_ALLOWED_DIRS = {".sigstore"}

# Known dependency directories
DEP_DIRS = {"deps", "node_modules", "vendor", "site-packages", ".venv", "venv"}

# Known dependency lockfiles
LOCKFILES = {
    "uv.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "requirements.txt",
    "Pipfile.lock",
    "poetry.lock",
    "Cargo.lock",
    "go.sum",
}

# Install hook prefixes
INSTALL_HOOK_PREFIXES = ("postinstall", "preinstall")


@ControlRegistry.register
class AI05BundleCompleteness(Control):
    """AI-05: Bundle Completeness.

    Requirement: The bundle MUST NOT contain unexpected executable files.
    All executable code must be referenced by the manifest (entry point,
    mcp_config args) or be in dependency directories.

    Approach (post files[] removal):
    1. Enumerate all files in the extracted bundle
    2. Build an "expected files" set from manifest fields
    3. Always allow documentation, signatures, and metadata
    4. Flag any executable files not referenced by the manifest
    """

    id = "AI-05"
    name = "Bundle Completeness"
    domain = "artifact_integrity"
    description = "Verify bundle contains no unexpected executable files"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Build the set of expected/referenced files from manifest
        referenced_files = self._build_referenced_files(manifest, bundle_dir)

        # Enumerate all files in the bundle
        all_files = [f for f in bundle_dir.rglob("*") if f.is_file()]

        for file_path in all_files:
            relative = str(file_path.relative_to(bundle_dir))
            relative_posix = relative.replace("\\", "/")

            # Skip always-allowed files
            if self._is_always_allowed(file_path, relative_posix):
                continue

            # Skip files in dependency directories
            if self._is_in_dep_dir(relative_posix):
                continue

            # Skip known lockfiles
            if file_path.name in LOCKFILES:
                continue

            # Skip files referenced by the manifest
            if relative_posix in referenced_files:
                continue

            # Check if this is an executable file
            ext = file_path.suffix.lower()
            name_lower = file_path.name.lower()

            is_install_hook = any(name_lower.startswith(prefix) for prefix in INSTALL_HOOK_PREFIXES)

            if is_install_hook:
                findings.append(
                    Finding(
                        id=f"AI-05-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.CRITICAL,
                        title=f"Unexpected install hook: {relative_posix}",
                        description=(
                            "Install hooks can execute arbitrary code during installation. "
                            "This file is not referenced by the manifest."
                        ),
                        file=relative_posix,
                        remediation="Remove the install hook or reference it in the manifest.",
                    )
                )
            elif ext in BINARY_EXTENSIONS:
                findings.append(
                    Finding(
                        id=f"AI-05-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.CRITICAL,
                        title=f"Unexpected binary: {relative_posix}",
                        description=(
                            "Binary files can contain arbitrary native code. "
                            "This file is not referenced by the manifest."
                        ),
                        file=relative_posix,
                        remediation="Remove the binary or reference it in the manifest.",
                    )
                )
            elif ext in SHELL_EXTENSIONS:
                findings.append(
                    Finding(
                        id=f"AI-05-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.CRITICAL,
                        title=f"Unexpected shell script: {relative_posix}",
                        description=(
                            "Shell scripts can execute arbitrary commands. This file is not referenced by the manifest."
                        ),
                        file=relative_posix,
                        remediation="Remove the shell script or reference it in the manifest.",
                    )
                )
            elif ext in EXECUTABLE_EXTENSIONS:
                findings.append(
                    Finding(
                        id=f"AI-05-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.HIGH,
                        title=f"Unexpected executable: {relative_posix}",
                        description=(
                            "Executable code file not referenced by the manifest entry point or mcp_config args."
                        ),
                        file=relative_posix,
                        remediation="Remove the file or reference it via server.entry_point or mcp_config.args.",
                    )
                )

        duration = int((time.time() - start) * 1000)

        status = ControlStatus.FAIL if findings else ControlStatus.PASS

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=status,
            findings=findings,
            duration_ms=duration,
        )

    def _build_referenced_files(self, manifest: dict[str, Any], bundle_dir: Path | None = None) -> set[str]:
        """Build set of files referenced by the manifest."""
        referenced: set[str] = set()

        # server.entry_point
        server = manifest.get("server", {})
        if isinstance(server, dict):
            entry_point = server.get("entry_point", "")
            if entry_point:
                referenced.add(entry_point)

        # Collect args from both mcp_config locations
        args_lists: list[list[Any]] = []

        mcp_config = manifest.get("mcp_config", {})
        if isinstance(mcp_config, dict):
            args = mcp_config.get("args", [])
            if isinstance(args, list):
                args_lists.append(args)

        if isinstance(server, dict):
            nested_config = server.get("mcp_config", {})
            if isinstance(nested_config, dict):
                args = nested_config.get("args", [])
                if isinstance(args, list):
                    args_lists.append(args)

        for args in args_lists:
            for i, arg in enumerate(args):
                if not isinstance(arg, str):
                    continue
                # Handle Python -m module.name pattern
                if arg == "-m" and i + 1 < len(args) and isinstance(args[i + 1], str):
                    module_name = args[i + 1]
                    if bundle_dir:
                        self._add_python_module_files(module_name, bundle_dir, referenced)
                    continue
                if self._looks_like_file(arg):
                    cleaned = arg.replace("${__dirname}/", "")
                    referenced.add(cleaned)

        # Node.js entry point directory resolution
        server_type = server.get("type", "") if isinstance(server, dict) else ""
        if server_type == "node" and entry_point and bundle_dir:
            self._add_node_entry_point_files(entry_point, bundle_dir, referenced)

        return referenced

    def _add_python_module_files(self, module_name: str, bundle_dir: Path, referenced: set[str]) -> None:
        """Resolve a Python -m module name to files in the bundle.

        For 'package.module', finds the package directory and adds all files.
        Searches common source layouts: direct, src/, and lib/.
        """
        parts = module_name.split(".")
        # The package root is the first dotted component (e.g., "mcp_echo" from "mcp_echo.server")
        package_root = parts[0]

        # Search common Python source layouts
        search_roots = [bundle_dir, bundle_dir / "src", bundle_dir / "lib"]

        for root in search_roots:
            package_dir = root / package_root
            if package_dir.is_dir():
                for f in package_dir.rglob("*"):
                    if f.is_file():
                        referenced.add(str(f.relative_to(bundle_dir)).replace("\\", "/"))

    def _add_node_entry_point_files(self, entry_point: str, bundle_dir: Path, referenced: set[str]) -> None:
        """Resolve a Node.js entry point to its sibling modules.

        TypeScript compiles to a directory (build/, dist/) where the entry
        point imports other .js files. Add all files in the entry point's
        directory tree as referenced.
        """
        entry_path = bundle_dir / entry_point
        if not entry_path.exists():
            return

        # Add all files in the entry point's parent directory tree
        entry_dir = entry_path.parent
        if entry_dir == bundle_dir:
            # Entry point is at root; don't add everything
            return

        for f in entry_dir.rglob("*"):
            if f.is_file():
                referenced.add(str(f.relative_to(bundle_dir)).replace("\\", "/"))

    def _looks_like_file(self, arg: str) -> bool:
        """Check if an argument looks like a file path."""
        # Skip flags
        if arg.startswith("-"):
            return False
        # Check for file extension or path separator
        return "." in arg or "/" in arg

    def _is_always_allowed(self, file_path: Path, relative: str) -> bool:
        """Check if a file is always allowed regardless of manifest."""
        name_lower = file_path.name.lower()
        stem_lower = file_path.stem.lower()
        ext_lower = file_path.suffix.lower()

        # manifest.json itself
        if name_lower == "manifest.json":
            return True

        # README*, LICENSE*, CHANGELOG* (case-insensitive)
        for allowed_stem in ALWAYS_ALLOWED_STEMS:
            if stem_lower.startswith(allowed_stem):
                return True

        # .sig files
        if ext_lower in ALWAYS_ALLOWED_EXTENSIONS:
            return True

        # .gitignore, .gitattributes
        if name_lower in {".gitignore", ".gitattributes"}:
            return True

        # .sigstore/ directory
        parts = Path(relative).parts
        if any(part in ALWAYS_ALLOWED_DIRS for part in parts):
            return True

        # _meta.org.mpaktrust metadata files are non-executable
        # (handled implicitly - they won't have executable extensions)

        return False

    def _is_in_dep_dir(self, relative: str) -> bool:
        """Check if a file is in a known dependency directory."""
        parts = Path(relative).parts
        return any(part in DEP_DIRS for part in parts)
