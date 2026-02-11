"""SC-05: Trusted Sources control (stub)."""

from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult


@ControlRegistry.register
class SC05TrustedSources(Control):
    """SC-05: Trusted Sources.

    Requirement: All dependencies MUST originate from approved package registries.
    Prohibited sources include file://, git+ without attestation, and unknown registries.

    Approved registries: npm, PyPI, crates.io, Maven Central, Go proxy.
    """

    id = "SC-05"
    name = "Trusted Sources"
    domain = "supply_chain"
    description = "Verify all dependencies come from approved registries"
    level = 3

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        return self.skip("Not yet implemented. Requires SBOM/lockfile parsing to validate package sources.")
