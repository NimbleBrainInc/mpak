"""AI-02: Content Hashes control (reserved)."""

from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult


@ControlRegistry.register
class AI02ContentHashes(Control):
    """AI-02: Content Hashes (Reserved).

    AI-02 is reserved. Bundle integrity is verified via RG-07 (Bundle Digest)
    at the registry layer. File-level content hashing in the manifest was
    removed from the MTF spec as it is too onerous for publishers and
    conceptually awkward (you cannot hash a bundle from inside the bundle).
    """

    id = "AI-02"
    name = "Content Hashes"
    domain = "artifact_integrity"
    description = "Reserved - bundle integrity verified via RG-07 (Bundle Digest)"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        return self.skip(
            "AI-02 (Content Hashes) is reserved. "
            "Bundle integrity is verified via RG-07 (Bundle Digest) at the registry layer."
        )
