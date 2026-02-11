"""CD-02: Permission Scope control.

Verifies that MCP servers declare the permissions and system access they require,
with enhanced detection for high-risk patterns like secret environment variables,
sensitive file paths, and init-time network access.
"""

import ast
import re
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Valid permission values per category
PERMISSION_CATEGORIES = {
    "filesystem": {"none", "read", "write", "full"},
    "network": {"none", "outbound", "inbound", "full"},
    "environment": {"none", "read", "write"},
    "subprocess": {"none", "restricted", "full"},
    "native": {"none", "required"},
}

# Patterns that indicate permission usage in Python code
PERMISSION_INDICATORS_PYTHON = {
    "filesystem": [
        r"\bopen\s*\(",
        r"Path\s*\(",
        r"pathlib\.",
        r"os\.(path|walk|listdir|remove|mkdir|rmdir|rename|chmod)",
        r"shutil\.",
        r"with\s+open\s*\(",
    ],
    "network": [
        r"\brequests\.",
        r"\bhttpx\.",
        r"\burllib",
        r"\baiohttp\.",
        r"\bsocket\.",
        r"http\.client",
        r"websocket",
    ],
    "environment": [
        r"os\.environ",
        r"os\.getenv",
        r"dotenv",
        r"environ\[",
    ],
    "subprocess": [
        r"subprocess\.",
        r"os\.system\s*\(",
        r"os\.popen\s*\(",
        r"os\.exec",
        r"os\.spawn",
        r"Popen\s*\(",
    ],
    "native": [
        r"ctypes\.",
        r"cffi\.",
        r"\.so\b",
        r"\.dll\b",
        r"\.dylib\b",
        r"ffi\.",
    ],
}

# Patterns that indicate permission usage in JavaScript/TypeScript code
PERMISSION_INDICATORS_JS = {
    "filesystem": [
        r"\bfs\.",
        r"fs/promises",
        r"\breadFile",
        r"\bwriteFile",
        r"\breaddir",
        r"\bmkdir",
        r"\brmdir",
        r"\bunlink",
        r"fs\.promises",
        r"createReadStream",
        r"createWriteStream",
    ],
    "network": [
        r"\bfetch\s*\(",
        r"\baxios\.",
        r"node-fetch",
        r"http\.request",
        r"https\.request",
        r"http\.get",
        r"https\.get",
        r"\.get\s*\(\s*['\"]http",
        r"\.post\s*\(",
        r"\bWebSocket\b",
        r"net\.connect",
        r"net\.createConnection",
        r"got\s*\(",
        r"superagent",
    ],
    "environment": [
        r"process\.env",
        r"\bdotenv\b",
        r"\.env\b",
    ],
    "subprocess": [
        r"child_process",
        r"\.exec\s*\(",
        r"\.execSync\s*\(",
        r"\.spawn\s*\(",
        r"\.spawnSync\s*\(",
        r"\.execFile\s*\(",
        r"\.fork\s*\(",
    ],
    "native": [
        r"\.node\b",
        r"ffi-napi",
        r"node-gyp",
        r"node-addon-api",
        r"require\s*\(\s*['\"]bindings['\"]",
        r"napi",
    ],
}

# JavaScript/TypeScript file extensions
JS_EXTENSIONS = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"}

# Directories containing dependencies
DEP_DIRS = ["deps", "node_modules", "vendor", "site-packages", ".venv", "venv"]

# Secret environment variable patterns (HIGH severity - blocking)
# Per MTF spec Section 6.5 CD-02
SECRET_ENV_PATTERNS = [
    r"AWS_ACCESS_KEY",
    r"AWS_SECRET",
    r"AWS_SESSION_TOKEN",
    r"AZURE_.*_KEY",
    r"AZURE_.*_SECRET",
    r"GCP_.*_KEY",
    r"GOOGLE_.*_KEY",
    r"GOOGLE_APPLICATION_CREDENTIALS",
    r".*_API_KEY",
    r".*_SECRET_KEY",
    r".*_PRIVATE_KEY",
    r".*_TOKEN",
    r".*_PASSWORD",
    r".*_CREDENTIALS",
    r"DATABASE_URL",
    r"MONGO.*_URI",
    r"REDIS_URL",
    r"GITHUB_TOKEN",
    r"GITLAB_TOKEN",
    r"NPM_TOKEN",
    r"PYPI_TOKEN",
    r"DOCKER_.*_TOKEN",
    r"SLACK_TOKEN",
    r"STRIPE_.*_KEY",
    r"TWILIO_.*_KEY",
    r"SENDGRID_.*_KEY",
    r"OPENAI_API_KEY",
    r"ANTHROPIC_API_KEY",
]

# Compiled secret env pattern
SECRET_ENV_REGEX = re.compile(
    r"(?:os\.(?:environ|getenv)|process\.env)[\.\[\(]['\"]?(" + "|".join(SECRET_ENV_PATTERNS) + r")['\"]?",
    re.IGNORECASE,
)

# Sensitive file paths (HIGH severity - blocking)
# Per MTF spec Section 6.5 CD-02
SENSITIVE_PATHS = [
    r"~?/\.ssh",
    r"~?/\.aws",
    r"~?/\.gcp",
    r"~?/\.azure",
    r"~?/\.config/gcloud",
    r"~?/\.kube",
    r"~?/\.docker",
    r"~?/\.gnupg",
    r"~?/\.gitconfig",
    r"~?/\.npmrc",
    r"~?/\.pypirc",
    r"~?/\.netrc",
    r"/etc/passwd",
    r"/etc/shadow",
    r"/etc/sudoers",
    r"id_rsa",
    r"id_ed25519",
    r"id_ecdsa",
    r"\.pem$",
    r"\.key$",
    r"credentials\.json",
    r"service[_-]?account.*\.json",
]

# Compiled sensitive paths pattern
SENSITIVE_PATH_REGEX = re.compile("|".join(SENSITIVE_PATHS), re.IGNORECASE)

# Severity tiers for undeclared permissions (per MTF spec)
# - native/subprocess: CRITICAL (dangerous, unusual for MCP servers)
# - filesystem with sensitive paths: HIGH (blocking)
# - environment with secret vars: HIGH (blocking)
# - init-time network: HIGH (blocking)
# - runtime network: MEDIUM (warning)
# - filesystem (general): MEDIUM (should be declared, but common)
# - network/environment (general): INFO (expected for most MCP servers)
UNDECLARED_PERMISSION_SEVERITY = {
    "native": Severity.CRITICAL,
    "subprocess": Severity.CRITICAL,
    "filesystem": Severity.MEDIUM,
    "network": Severity.INFO,
    "environment": Severity.INFO,
}

# Only these undeclared permissions cause a FAIL status
BLOCKING_PERMISSIONS = {"native", "subprocess"}


def is_inside_function(source: str, line_number: int) -> bool:
    """Check if a line is inside a function definition (runtime) vs module level (init-time).

    Returns True if the code is inside a function (runtime), False if at module level (init-time).
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # If we can't parse, assume module level (safer)
        return False

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Check if line_number falls within this function
            if hasattr(node, "lineno") and hasattr(node, "end_lineno"):
                if node.lineno <= line_number <= (node.end_lineno or node.lineno):
                    return True
    return False


def find_line_number(content: str, pattern: str) -> int | None:
    """Find the line number where a pattern matches."""
    for i, line in enumerate(content.split("\n"), 1):
        if re.search(pattern, line, re.IGNORECASE):
            return i
    return None


def extract_declared_env_vars(manifest: dict[str, Any]) -> set[str]:
    """Extract environment variable names declared in the manifest.

    Checks:
    - server.mcp_config.env keys
    - mcp_config.env keys (legacy format)
    - user_config fields that map to env vars
    """
    declared: set[str] = set()

    # Check server.mcp_config.env
    server = manifest.get("server", {})
    mcp_config = server.get("mcp_config", {})
    env_vars = mcp_config.get("env", {})
    if isinstance(env_vars, dict):
        declared.update(env_vars.keys())

    # Check top-level mcp_config.env (legacy format)
    legacy_mcp_config = manifest.get("mcp_config", {})
    legacy_env = legacy_mcp_config.get("env", {})
    if isinstance(legacy_env, dict):
        declared.update(legacy_env.keys())

    return declared


@ControlRegistry.register
class CD02PermissionScope(Control):
    """CD-02: Permission Scope.

    Requirement: The bundle MUST declare the permissions and system access
    it requires.

    Enhanced checks per MTF spec Section 6.5:
    - Init-time network access = HIGH (blocking)
    - Runtime network access = MEDIUM (warning)
    - Secret env vars (AWS_*, *_TOKEN, etc.) = HIGH (blocking)
    - Sensitive paths (~/.ssh, ~/.aws) = HIGH (blocking)
    - Native/subprocess = CRITICAL (blocking)
    """

    id = "CD-02"
    name = "Permission Scope"
    domain = "capability_declaration"
    description = "Verify permissions are declared and match code behavior"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Check for permissions in MTF namespace: _meta.org.mpaktrust.permissions
        permissions = manifest.get("_meta", {}).get("org.mpaktrust", {}).get("permissions", {})

        if not permissions:
            # Missing permissions block is a compliance issue for L2+, not a security vulnerability
            # The real security concern is undeclared permission USAGE (checked below)
            findings.append(
                Finding(
                    id="CD-02-0001",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No permissions declared",
                    description="manifest.json does not include a 'permissions' field (required for L2+)",
                    file="manifest.json",
                    remediation=(
                        "Add 'permissions' field declaring filesystem, network, environment, subprocess, native access"
                    ),
                )
            )

        # Validate permission values
        for category, valid_values in PERMISSION_CATEGORIES.items():
            declared_value = permissions.get(category)

            if declared_value is None:
                if permissions:  # Only warn if permissions block exists
                    findings.append(
                        Finding(
                            id=f"CD-02-{len(findings) + 1:04d}",
                            control=self.id,
                            severity=Severity.LOW,
                            title=f"Missing permission: {category}",
                            description=f"Permission category '{category}' not declared",
                            file="manifest.json",
                            remediation=(f"Add '{category}' to permissions (valid: {', '.join(sorted(valid_values))})"),
                        )
                    )
            elif declared_value not in valid_values:
                findings.append(
                    Finding(
                        id=f"CD-02-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.MEDIUM,
                        title=f"Invalid permission value: {category}={declared_value}",
                        description=f"Valid values for '{category}': {', '.join(sorted(valid_values))}",
                        file="manifest.json",
                    )
                )

        # Extract declared env vars from manifest (mcp_config.env, user_config)
        declared_env_vars = extract_declared_env_vars(manifest)

        # Analyze server code for permission usage (including high-risk patterns)
        detected_permissions, high_risk_findings = self._detect_permissions_enhanced(
            bundle_dir, permissions, declared_env_vars
        )

        # Add high-risk findings (secret env vars, sensitive paths, init-time network)
        findings.extend(high_risk_findings)

        # Compare declared vs detected for basic permissions
        for category, detected in detected_permissions.items():
            if not detected:
                continue

            declared_value = permissions.get(category, "none")

            # Check for undeclared permissions
            if declared_value == "none" and detected:
                files_str = ", ".join(detected[:3])
                if len(detected) > 3:
                    files_str += f" (+{len(detected) - 3} more)"

                # Severity depends on how unusual/dangerous the capability is for MCP servers
                severity = UNDECLARED_PERMISSION_SEVERITY.get(category, Severity.MEDIUM)

                findings.append(
                    Finding(
                        id=f"CD-02-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=severity,
                        title=f"Undeclared {category} permission",
                        description=(f"Code uses {category} capabilities but declares 'none'. Found in: {files_str}"),
                        file="manifest.json",
                        remediation=f"Update permissions.{category} to reflect actual usage",
                        metadata={"files": detected},
                    )
                )

        duration = int((time.time() - start) * 1000)

        # Fail if permissions block is missing entirely
        has_no_permissions = any("No permissions declared" in f.title for f in findings)

        # Fail for undeclared BLOCKING permissions (native, subprocess)
        has_blocking_undeclared = any(
            "Undeclared" in f.title and any(bp in f.title for bp in BLOCKING_PERMISSIONS) for f in findings
        )

        # Fail for HIGH or CRITICAL severity findings (secret env, sensitive paths, init-time network)
        has_high_severity = any(f.severity in (Severity.HIGH, Severity.CRITICAL) for f in findings)

        if permissions and not has_no_permissions:
            findings.insert(
                0,
                Finding(
                    id="CD-02-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title="Permissions declared",
                    description=", ".join(f"{k}={v}" for k, v in permissions.items()),
                ),
            )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=(
                ControlStatus.FAIL
                if (has_no_permissions or has_blocking_undeclared or has_high_severity)
                else ControlStatus.PASS
            ),
            findings=findings,
            duration_ms=duration,
            raw_output={
                "declared": permissions,
                "detected": {k: len(v) for k, v in detected_permissions.items()},
            },
        )

    def _detect_permissions_enhanced(
        self, bundle_dir: Path, permissions: dict[str, str], declared_env_vars: set[str]
    ) -> tuple[dict[str, list[str]], list[Finding]]:
        """Detect permission usage in server code with enhanced high-risk pattern detection.

        Args:
            bundle_dir: Path to the extracted bundle
            permissions: Declared permissions from manifest
            declared_env_vars: Set of env var names declared in mcp_config.env

        Returns:
            Tuple of (detected_permissions dict, high_risk_findings list)
        """
        detected: dict[str, list[str]] = {cat: [] for cat in PERMISSION_CATEGORIES}
        high_risk_findings: list[Finding] = []
        finding_count = 100  # Start high to avoid ID collision

        # Scan Python files
        for py_file in bundle_dir.rglob("*.py"):
            file_findings, finding_count = self._scan_file_enhanced(
                py_file,
                bundle_dir,
                PERMISSION_INDICATORS_PYTHON,
                detected,
                permissions,
                finding_count,
                declared_env_vars,
                is_python=True,
            )
            high_risk_findings.extend(file_findings)

        # Scan JavaScript/TypeScript files
        for ext in JS_EXTENSIONS:
            for js_file in bundle_dir.rglob(f"*{ext}"):
                file_findings, finding_count = self._scan_file_enhanced(
                    js_file,
                    bundle_dir,
                    PERMISSION_INDICATORS_JS,
                    detected,
                    permissions,
                    finding_count,
                    declared_env_vars,
                    is_python=False,
                )
                high_risk_findings.extend(file_findings)

        return detected, high_risk_findings

    def _scan_file_enhanced(
        self,
        file_path: Path,
        bundle_dir: Path,
        indicators: dict[str, list[str]],
        detected: dict[str, list[str]],
        permissions: dict[str, str],
        finding_count: int,
        declared_env_vars: set[str],
        is_python: bool = True,
    ) -> tuple[list[Finding], int]:
        """Scan a single file for permission indicators with enhanced high-risk detection.

        Args:
            declared_env_vars: Set of env var names declared in mcp_config.env (skip these)
        """
        findings: list[Finding] = []

        try:
            relative = str(file_path.relative_to(bundle_dir))
        except ValueError:
            return findings, finding_count

        # Skip dependency directories
        if any(dep_dir in relative for dep_dir in DEP_DIRS):
            return findings, finding_count

        # Skip test files
        if "test" in relative.lower() or "spec" in relative.lower():
            return findings, finding_count

        try:
            content = file_path.read_text()
        except Exception:
            return findings, finding_count

        # Check for basic permission indicators
        for category, patterns in indicators.items():
            for pattern in patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    if relative not in detected[category]:
                        detected[category].append(relative)
                    break

        # Enhanced check 1: Secret environment variables (HIGH - blocking)
        # Skip env vars that are declared in mcp_config.env (those are properly configured)
        env_declared = permissions.get("environment", "none")
        if env_declared == "none":
            for match in SECRET_ENV_REGEX.finditer(content):
                env_var = match.group(1)
                # Skip if this env var is declared in the manifest's mcp_config.env
                if env_var in declared_env_vars:
                    continue
                line_num = find_line_number(content, re.escape(match.group(0)))
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-02-{finding_count:04d}",
                        control=self.id,
                        severity=Severity.HIGH,
                        title=f"Secret environment variable access: {env_var}",
                        description=(
                            f"Code accesses secret environment variable '{env_var}' "
                            "but environment permission is 'none'. "
                            "Secret env vars require explicit declaration."
                        ),
                        file=relative,
                        line=line_num,
                        remediation="Declare environment permission and document which secrets are accessed",
                        metadata={"env_var": env_var, "category": "secret_env"},
                    )
                )

        # Enhanced check 2: Sensitive file paths (HIGH - blocking)
        fs_declared = permissions.get("filesystem", "none")
        if fs_declared == "none":
            for match in SENSITIVE_PATH_REGEX.finditer(content):
                path_match = match.group(0)
                line_num = find_line_number(content, re.escape(path_match))
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-02-{finding_count:04d}",
                        control=self.id,
                        severity=Severity.HIGH,
                        title=f"Sensitive path access: {path_match}",
                        description=(
                            f"Code accesses sensitive path '{path_match}' "
                            "but filesystem permission is 'none'. "
                            "Accessing credential/config paths requires explicit declaration."
                        ),
                        file=relative,
                        line=line_num,
                        remediation="Declare filesystem permission and document which sensitive paths are accessed",
                        metadata={"path": path_match, "category": "sensitive_path"},
                    )
                )

        # Enhanced check 3: Init-time network access (HIGH - blocking) vs runtime (MEDIUM)
        # Only check Python files for now (AST parsing)
        network_declared = permissions.get("network", "none")
        if network_declared == "none" and is_python:
            for pattern in indicators.get("network", []):
                for _match in re.finditer(pattern, content, re.IGNORECASE):
                    line_num = find_line_number(content, pattern)
                    if line_num:
                        # Check if this is init-time (module level) or runtime (inside function)
                        is_runtime = is_inside_function(content, line_num)
                        severity = Severity.MEDIUM if is_runtime else Severity.HIGH
                        context = "runtime" if is_runtime else "init-time"

                        if is_runtime:
                            desc_suffix = "Network access should be declared."
                        else:
                            desc_suffix = "Init-time network access runs before user consent."

                        finding_count += 1
                        findings.append(
                            Finding(
                                id=f"CD-02-{finding_count:04d}",
                                control=self.id,
                                severity=severity,
                                title=f"Undeclared {context} network access",
                                description=(
                                    f"Code makes {context} network calls but network permission is 'none'. "
                                    f"{desc_suffix}"
                                ),
                                file=relative,
                                line=line_num,
                                remediation="Declare network permission (outbound/inbound/full)",
                                metadata={"context": context, "category": "network_timing"},
                            )
                        )
                        break  # Only report once per file per pattern type

        return findings, finding_count
