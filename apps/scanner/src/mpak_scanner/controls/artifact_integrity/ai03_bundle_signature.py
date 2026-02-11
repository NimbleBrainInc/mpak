"""AI-03: Bundle Signature control (stub)."""

from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult


@ControlRegistry.register
class AI03BundleSignature(Control):
    """AI-03: Bundle Signature.

    Requirement: The bundle MUST be cryptographically signed using an
    approved algorithm: ECDSA P-256, Ed25519, or RSA-4096+.

    Sigstore keyless signing is recommended for CI/CD integration.
    """

    id = "AI-03"
    name = "Bundle Signature"
    domain = "artifact_integrity"
    description = "Verify cryptographic signature on bundle"
    level = 3

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        return self.skip("Not yet implemented. Requires cosign or similar signature verification.")
