"""PR-04: Commit Linkage control (stub)."""

from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult


@ControlRegistry.register
class PR04CommitLinkage(Control):
    """PR-04: Commit Linkage (RECOMMENDED).

    Requirement: The bundle SHOULD be linked to an exact commit SHA in the
    source repository. The commit should be signed and the content should
    match the bundle.

    This is a recommended control for L4, not strictly required.
    """

    id = "PR-04"
    name = "Commit Linkage"
    domain = "provenance"
    description = "Verify bundle links to exact source commit"
    level = 4

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        return self.skip("Not yet implemented. Requires git clone and content verification.")
