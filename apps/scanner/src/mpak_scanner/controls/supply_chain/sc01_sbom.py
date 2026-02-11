"""SC-01: SBOM Generation control."""

import json
import subprocess
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity


@ControlRegistry.register
class SC01SbomGeneration(Control):
    """SC-01: SBOM Generation.

    Requirement: The bundle MUST include or be accompanied by a Software Bill
    of Materials (SBOM) listing all included components.
    """

    id = "SC-01"
    name = "SBOM Generation"
    domain = "supply_chain"
    description = "Generate Software Bill of Materials listing all components"
    level = 1

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()

        try:
            result = subprocess.run(
                ["syft", f"dir:{bundle_dir}", "-o", "cyclonedx-json"],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError:
            return self.error("syft not found. Install with: brew install syft")
        except subprocess.TimeoutExpired:
            return self.error("SBOM generation timed out")

        duration = int((time.time() - start) * 1000)

        if result.returncode != 0:
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                error=result.stderr or "SBOM generation failed",
                duration_ms=duration,
            )

        try:
            sbom = json.loads(result.stdout)
            components = sbom.get("components", [])

            # SBOM generation succeeded - this is a pass
            # We report components as info-level findings for visibility
            findings: list[Finding] = []
            for i, comp in enumerate(components):
                findings.append(
                    Finding(
                        id=f"SC-01-{i:04d}",
                        control=self.id,
                        severity=Severity.INFO,
                        title=f"Component: {comp.get('name', 'unknown')}",
                        description=f"Version {comp.get('version', 'unknown')}",
                        metadata={
                            "name": comp.get("name"),
                            "version": comp.get("version"),
                            "purl": comp.get("purl", ""),
                            "type": comp.get("type", ""),
                        },
                    )
                )

            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.PASS,
                findings=findings,
                duration_ms=duration,
                raw_output=sbom,
            )

        except json.JSONDecodeError as e:
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                error=f"Failed to parse SBOM: {e}",
                duration_ms=duration,
            )
