"""AI-04: Reproducible Build control (stub)."""

from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult


@ControlRegistry.register
class AI04ReproducibleBuild(Control):
    """AI-04: Reproducible Build (RECOMMENDED).

    Requirement: The bundle SHOULD be reproducibly built, allowing independent
    verification that the bundle matches the claimed source code.

    This is a recommended control for L4, not strictly required.
    """

    id = "AI-04"
    name = "Reproducible Build"
    domain = "artifact_integrity"
    description = "Verify bundle can be reproduced from source"
    level = 4

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        return self.skip("Not yet implemented. Requires rebuild infrastructure and content comparison.")
