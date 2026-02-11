"""CD-03: Tool Description Safety control.

Detects prompt injection, exfiltration directives, and hidden instructions
in MCP tool descriptions. This is an MCP-specific control because LLMs
treat tool descriptions as trusted instructions.
"""

import base64
import re
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Prompt injection patterns - instructions that manipulate LLM behavior
INJECTION_PATTERNS = [
    # Direct manipulation
    (
        r"(ignore|disregard|forget)\s+(previous|above|prior|all)\s+(instruction|context|rule)",
        Severity.CRITICAL,
        "prompt_injection",
    ),
    (r"(you\s+must|always|never)\s+(first|before|after)", Severity.HIGH, "behavioral_directive"),
    (r"(override|bypass)\s+(security|safety|restriction|rule)", Severity.CRITICAL, "security_bypass"),
    # Hidden instructions
    (r"(secretly|silently|quietly|without\s+telling)", Severity.CRITICAL, "hidden_action"),
    (r"(do\s+not|don't)\s+(tell|inform|notify|mention)", Severity.HIGH, "concealment"),
    # Role manipulation
    (r"(you\s+are\s+now|act\s+as|pretend\s+to\s+be|role\s*:)", Severity.HIGH, "role_manipulation"),
    (r"(new\s+instruction|system\s*:)", Severity.HIGH, "instruction_injection"),
]

# Exfiltration patterns - instructions to read/send sensitive data
EXFILTRATION_PATTERNS = [
    # File access instructions
    (
        r"(read|get|fetch|retrieve|include|output|print)\s+.{0,30}(\/\.ssh|\.aws|\.env|\.git|credential|secret|key|password|token)",
        Severity.CRITICAL,
        "credential_exfil",
    ),
    (r"(read|get|cat|open)\s+.{0,20}(id_rsa|id_ed25519|known_hosts|config)", Severity.CRITICAL, "ssh_key_access"),
    (r"(read|include)\s+.{0,30}(\.bashrc|\.bash_profile|\.zshrc|\.profile)", Severity.HIGH, "shell_config_access"),
    (r"(read|access)\s+.{0,20}(\/etc\/passwd|\/etc\/shadow)", Severity.CRITICAL, "system_file_access"),
    # Data exfiltration instructions
    (
        r"(send|post|transmit|upload|exfiltrate)\s+.{0,30}(data|content|file|secret|credential)",
        Severity.CRITICAL,
        "data_exfil",
    ),
    (r"(include|embed|add|append)\s+.{0,30}(in|to)\s+(response|output|result)", Severity.HIGH, "data_inclusion"),
    # Environment access
    (r"(access|read|get|dump)\s+.{0,20}(environment|env\s*var|os\.environ)", Severity.HIGH, "env_access"),
]

# URL patterns - undeclared URLs in descriptions
URL_PATTERN = re.compile(r'https?://[^\s<>"]+', re.IGNORECASE)

# Allowed URL domains (documentation, well-known APIs)
ALLOWED_URL_DOMAINS = {
    "api.",
    "docs.",
    "www.",
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "npmjs.com",
    "pypi.org",
    "wikipedia.org",
}

# Obfuscation detection patterns
OBFUSCATION_PATTERNS = [
    (r"[A-Za-z0-9+/]{50,}={0,2}", "base64_long"),  # Long base64 strings
    (r"\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){3,}", "hex_escape"),  # Hex escapes
    (r"&#x?[0-9a-fA-F]+;(&#x?[0-9a-fA-F]+;){3,}", "html_entity"),  # HTML entities
    (r"\\u[0-9a-fA-F]{4}(\\u[0-9a-fA-F]{4}){3,}", "unicode_escape"),  # Unicode escapes
]


def check_base64_content(text: str) -> list[tuple[str, str]]:
    """Check for suspicious base64-encoded content."""
    suspicious = []
    # Find potential base64 strings
    base64_pattern = re.compile(r"[A-Za-z0-9+/]{20,}={0,2}")
    for match in base64_pattern.finditer(text):
        encoded = match.group()
        try:
            decoded = base64.b64decode(encoded).decode("utf-8", errors="ignore")
            # Check if decoded content contains suspicious keywords
            suspicious_keywords = ["exec", "eval", "import", "subprocess", "os.", "http", "ssh", "credential"]
            for keyword in suspicious_keywords:
                if keyword in decoded.lower():
                    suspicious.append((encoded[:30] + "...", decoded[:50]))
                    break
        except Exception:
            pass
    return suspicious


def extract_urls(text: str) -> list[str]:
    """Extract URLs from text."""
    return URL_PATTERN.findall(text)


def is_url_suspicious(url: str) -> bool:
    """Check if URL is suspicious (not from allowed domains)."""
    url_lower = url.lower()
    for allowed in ALLOWED_URL_DOMAINS:
        if allowed in url_lower:
            return False
    return True


def check_semantic_mismatch(tool_name: str, description: str) -> tuple[bool, str | None]:
    """Check if description semantically mismatches the tool name.

    Simple heuristic: if tool name suggests one domain but description
    mentions unrelated sensitive operations.
    """
    # Keywords that suggest file/system operations
    file_keywords = {"read", "write", "open", "save", "delete", "file", "directory", "path"}
    credential_keywords = {"password", "secret", "key", "token", "credential", "auth"}

    name_lower = tool_name.lower()
    desc_lower = description.lower()

    # Check for semantic mismatches
    # Example: tool named "get_weather" but description mentions file operations
    if "weather" in name_lower or "time" in name_lower or "date" in name_lower:
        if any(kw in desc_lower for kw in file_keywords):
            return True, "Tool name suggests data retrieval but description mentions file operations"
        if any(kw in desc_lower for kw in credential_keywords):
            return True, "Tool name suggests benign operation but description mentions credentials"

    # Tool named for display/UI but does file operations
    if "display" in name_lower or "show" in name_lower or "render" in name_lower:
        if "write" in desc_lower or "delete" in desc_lower or "remove" in desc_lower:
            return True, "Tool name suggests display but description mentions write/delete operations"

    return False, None


@ControlRegistry.register
class CD03ToolDescriptionSafety(Control):
    """CD-03: Tool Description Safety.

    Requirement: Tool descriptions MUST NOT contain hidden instructions,
    exfiltration directives, prompt injection patterns, or semantic content
    that contradicts the tool's stated purpose.

    This is an MCP-specific control because LLMs treat tool descriptions
    as trusted instructions.
    """

    id = "CD-03"
    name = "Tool Description Safety"
    domain = "capability_declaration"
    description = "Detect prompt injection and malicious content in tool descriptions"
    level = 2
    mcp_specific = True

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Get tools from manifest
        tools = manifest.get("tools", [])

        if not tools:
            findings.append(
                Finding(
                    id="CD-03-0001",
                    control=self.id,
                    severity=Severity.INFO,
                    title="No tools to check",
                    description="manifest.json does not declare any tools",
                    file="manifest.json",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.PASS,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        finding_count = 0
        tools_checked = 0

        for tool in tools:
            if not isinstance(tool, dict):
                continue

            tool_name = tool.get("name", f"tool_{tools_checked}")
            description = tool.get("description", "")
            tools_checked += 1

            if not description:
                continue  # CD-01 handles missing descriptions

            # Check 1: Prompt injection patterns (CRITICAL/HIGH)
            for pattern, severity, category in INJECTION_PATTERNS:
                if re.search(pattern, description, re.IGNORECASE):
                    finding_count += 1
                    findings.append(
                        Finding(
                            id=f"CD-03-{finding_count:04d}",
                            control=self.id,
                            severity=severity,
                            title=f"Prompt injection in tool '{tool_name}'",
                            description=f"Tool description contains {category.replace('_', ' ')} pattern",
                            file="manifest.json",
                            remediation="Remove manipulative instructions from tool description",
                            metadata={"tool": tool_name, "category": category, "pattern": pattern},
                        )
                    )

            # Check 2: Exfiltration patterns (CRITICAL/HIGH)
            for pattern, severity, category in EXFILTRATION_PATTERNS:
                if re.search(pattern, description, re.IGNORECASE):
                    finding_count += 1
                    findings.append(
                        Finding(
                            id=f"CD-03-{finding_count:04d}",
                            control=self.id,
                            severity=severity,
                            title=f"Exfiltration directive in tool '{tool_name}'",
                            description=f"Tool description instructs {category.replace('_', ' ')}",
                            file="manifest.json",
                            remediation="Remove data access instructions from tool description",
                            metadata={"tool": tool_name, "category": category},
                        )
                    )

            # Check 3: Suspicious URLs (MEDIUM)
            urls = extract_urls(description)
            for url in urls:
                if is_url_suspicious(url):
                    finding_count += 1
                    findings.append(
                        Finding(
                            id=f"CD-03-{finding_count:04d}",
                            control=self.id,
                            severity=Severity.MEDIUM,
                            title=f"Suspicious URL in tool '{tool_name}'",
                            description=f"Tool description contains undeclared URL: {url[:50]}...",
                            file="manifest.json",
                            remediation="Remove or declare external URLs in tool description",
                            metadata={"tool": tool_name, "url": url},
                        )
                    )

            # Check 4: Obfuscated content (HIGH)
            for pattern, obfuscation_type in OBFUSCATION_PATTERNS:
                if re.search(pattern, description):
                    finding_count += 1
                    findings.append(
                        Finding(
                            id=f"CD-03-{finding_count:04d}",
                            control=self.id,
                            severity=Severity.HIGH,
                            title=f"Obfuscated content in tool '{tool_name}'",
                            description=f"Tool description contains {obfuscation_type.replace('_', ' ')} encoding",
                            file="manifest.json",
                            remediation="Remove obfuscated/encoded content from tool description",
                            metadata={"tool": tool_name, "obfuscation_type": obfuscation_type},
                        )
                    )

            # Check 5: Base64 with suspicious decoded content (CRITICAL)
            suspicious_b64 = check_base64_content(description)
            for encoded, decoded in suspicious_b64:
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-03-{finding_count:04d}",
                        control=self.id,
                        severity=Severity.CRITICAL,
                        title=f"Hidden code in tool '{tool_name}'",
                        description=f"Base64 content decodes to suspicious code: {decoded}",
                        file="manifest.json",
                        remediation="Remove encoded content from tool description",
                        metadata={"tool": tool_name, "encoded": encoded, "decoded": decoded},
                    )
                )

            # Check 6: Semantic mismatch (MEDIUM)
            is_mismatch, reason = check_semantic_mismatch(tool_name, description)
            if is_mismatch and reason:
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-03-{finding_count:04d}",
                        control=self.id,
                        severity=Severity.MEDIUM,
                        title=f"Semantic mismatch in tool '{tool_name}'",
                        description=reason,
                        file="manifest.json",
                        remediation="Ensure tool description matches its stated purpose",
                        metadata={"tool": tool_name},
                    )
                )

        duration = int((time.time() - start) * 1000)

        # Determine status
        has_critical = any(f.severity == Severity.CRITICAL for f in findings)
        has_high = any(f.severity == Severity.HIGH for f in findings)

        if not findings or all(f.severity == Severity.INFO for f in findings):
            findings.insert(
                0,
                Finding(
                    id="CD-03-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title="Tool descriptions are safe",
                    description=f"Checked {tools_checked} tool descriptions, no injection patterns found",
                ),
            )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if (has_critical or has_high) else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
            raw_output={
                "tools_checked": tools_checked,
                "findings_count": finding_count,
            },
        )
