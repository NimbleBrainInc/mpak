"""CD-05: Token Lifetime Declaration control.

Verifies that MCP servers declare appropriate token lifetimes for their
credential requirements. This is an MCP-specific control for OAuth/API
token management transparency.
"""

import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Valid token lifetime values per MTF spec
VALID_TOKEN_LIFETIMES = {"session", "persistent", "offline"}

# Lifetime risk levels
LIFETIME_RISK: dict[str, Severity] = {
    "session": Severity.INFO,  # Tokens expire with session, lowest risk
    "persistent": Severity.LOW,  # Tokens persist across sessions
    "offline": Severity.MEDIUM,  # Offline access tokens, highest baseline risk
}


@ControlRegistry.register
class CD05TokenLifetime(Control):
    """CD-05: Token Lifetime Declaration.

    Requirement: MCP servers that require credentials MUST declare the
    expected token lifetime for each credential type.

    Valid values:
    - session: Token expires when the session ends
    - persistent: Token persists across sessions but requires refresh
    - offline: Token provides offline access (refresh tokens, long-lived)

    This is an MCP-specific control addressing OAuth scope transparency.
    """

    id = "CD-05"
    name = "Token Lifetime Declaration"
    domain = "capability_declaration"
    description = "Verify token lifetimes are declared for credentials"
    level = 3
    mcp_specific = True

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Get credentials from manifest
        credentials = manifest.get("credentials", {})

        if not credentials:
            # No credentials declared, control passes (not applicable)
            findings.append(
                Finding(
                    id="CD-05-0001",
                    control=self.id,
                    severity=Severity.INFO,
                    title="No credentials declared",
                    description="manifest.json does not declare any credentials requiring tokens",
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
        credentials_checked = 0
        has_blocking_issue = False

        # Check each credential entry
        for cred_name, cred_config in credentials.items():
            if not isinstance(cred_config, dict):
                continue

            credentials_checked += 1
            token_lifetime = cred_config.get("token_lifetime")

            # Check 1: Missing token_lifetime (HIGH - blocking)
            if token_lifetime is None:
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-05-{finding_count:04d}",
                        control=self.id,
                        severity=Severity.HIGH,
                        title=f"Missing token_lifetime for '{cred_name}'",
                        description=(
                            f"Credential '{cred_name}' does not declare token_lifetime. "
                            "Users cannot assess token persistence risk."
                        ),
                        file="manifest.json",
                        remediation=(
                            f"Add 'token_lifetime' to credentials.{cred_name} (valid: session, persistent, offline)"
                        ),
                        metadata={"credential": cred_name},
                    )
                )
                has_blocking_issue = True
                continue

            # Check 2: Invalid token_lifetime value (MEDIUM)
            if token_lifetime not in VALID_TOKEN_LIFETIMES:
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-05-{finding_count:04d}",
                        control=self.id,
                        severity=Severity.MEDIUM,
                        title=f"Invalid token_lifetime for '{cred_name}'",
                        description=(
                            f"Credential '{cred_name}' has token_lifetime='{token_lifetime}' "
                            f"which is not a valid value. Valid: {', '.join(sorted(VALID_TOKEN_LIFETIMES))}"
                        ),
                        file="manifest.json",
                        remediation=f"Set token_lifetime to one of: {', '.join(sorted(VALID_TOKEN_LIFETIMES))}",
                        metadata={"credential": cred_name, "value": token_lifetime},
                    )
                )
                continue

            # Check 3: Offline access without justification (HIGH if no justification)
            if token_lifetime == "offline":  # noqa: S105
                justification = cred_config.get("offline_justification")
                if not justification:
                    finding_count += 1
                    findings.append(
                        Finding(
                            id=f"CD-05-{finding_count:04d}",
                            control=self.id,
                            severity=Severity.HIGH,
                            title=f"Offline access without justification for '{cred_name}'",
                            description=(
                                f"Credential '{cred_name}' requests offline access (refresh tokens) "
                                "but does not provide justification. Offline tokens have elevated risk."
                            ),
                            file="manifest.json",
                            remediation=(
                                f"Add 'offline_justification' to credentials.{cred_name} "
                                "explaining why offline access is needed"
                            ),
                            metadata={"credential": cred_name, "token_lifetime": token_lifetime},
                        )
                    )
                    has_blocking_issue = True
                else:
                    # Offline with justification is acceptable but noted
                    finding_count += 1
                    findings.append(
                        Finding(
                            id=f"CD-05-{finding_count:04d}",
                            control=self.id,
                            severity=Severity.LOW,
                            title=f"Offline access declared for '{cred_name}'",
                            description=(
                                f"Credential '{cred_name}' uses offline tokens. "
                                f"Justification: {justification[:100]}{'...' if len(justification) > 100 else ''}"
                            ),
                            file="manifest.json",
                            metadata={
                                "credential": cred_name,
                                "token_lifetime": token_lifetime,
                                "justification": justification,
                            },
                        )
                    )
            else:
                # Record the declared lifetime as info
                risk_level = LIFETIME_RISK.get(token_lifetime, Severity.INFO)
                finding_count += 1
                findings.append(
                    Finding(
                        id=f"CD-05-{finding_count:04d}",
                        control=self.id,
                        severity=risk_level,
                        title=f"Token lifetime declared for '{cred_name}'",
                        description=f"Credential '{cred_name}' uses {token_lifetime} tokens",
                        file="manifest.json",
                        metadata={"credential": cred_name, "token_lifetime": token_lifetime},
                    )
                )

        duration = int((time.time() - start) * 1000)

        # If no credentials were actually checked (all were invalid types)
        if credentials_checked == 0:
            findings.append(
                Finding(
                    id="CD-05-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title="No valid credential entries",
                    description="No credential entries with valid format found in manifest",
                    file="manifest.json",
                )
            )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if has_blocking_issue else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
            raw_output={
                "credentials_checked": credentials_checked,
                "findings_count": finding_count,
            },
        )
