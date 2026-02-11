"""CD-04: Credential Scope Declaration control (stub)."""

from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult


@ControlRegistry.register
class CD04CredentialScope(Control):
    """CD-04: Credential Scope Declaration.

    Requirement: MCP servers that require OAuth or API credentials MUST
    declare the requested scopes in the manifest.

    Elevated scopes (admin, write, delete) require justification fields
    explaining why they are needed.

    This is an MCP-specific control addressing credential aggregation risks.
    """

    id = "CD-04"
    name = "Credential Scope Declaration"
    domain = "capability_declaration"
    description = "Verify OAuth/API scopes are declared with justifications"
    level = 3
    mcp_specific = True

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        return self.skip("Not yet implemented. Requires manifest.credentials scope validation.")
