"""CD-01: Tool Declaration control."""

import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity


@ControlRegistry.register
class CD01ToolDeclaration(Control):
    """CD-01: Tool Declaration.

    Requirement: The bundle MUST declare all tools it provides with descriptions.
    """

    id = "CD-01"
    name = "Tool Declaration"
    domain = "capability_declaration"
    description = "Validate that all tools are declared with descriptions"
    level = 1

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Check if tools are declared in manifest
        tools = manifest.get("tools", [])

        if not tools:
            # Tools might be discoverable via MCP protocol at runtime
            # If not in manifest, we note it as a warning but don't fail
            # because the MCP protocol allows dynamic tool discovery
            findings.append(
                Finding(
                    id="CD-01-0001",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No tools declared in manifest",
                    description=("Tools are not listed in manifest.json. They may be discoverable at runtime."),
                    file="manifest.json",
                    remediation="Add a 'tools' array to manifest.json listing all available tools",
                )
            )
        else:
            # Validate each tool has required fields
            for i, tool in enumerate(tools):
                tool_name = tool.get("name", f"tool_{i}")

                # Check for name
                if not tool.get("name"):
                    findings.append(
                        Finding(
                            id=f"CD-01-{len(findings) + 1:04d}",
                            control=self.id,
                            severity=Severity.MEDIUM,
                            title="Tool missing name",
                            description=f"Tool at index {i} does not have a 'name' field",
                            file="manifest.json",
                            remediation="Add a 'name' field to the tool declaration",
                        )
                    )

                # Check for description
                if not tool.get("description"):
                    findings.append(
                        Finding(
                            id=f"CD-01-{len(findings) + 1:04d}",
                            control=self.id,
                            severity=Severity.MEDIUM,
                            title=f"Tool '{tool_name}' missing description",
                            description="Tool declarations should include human-readable descriptions",
                            file="manifest.json",
                            remediation=f"Add a 'description' field to the '{tool_name}' tool",
                        )
                    )

                # Check for ambiguous or overly generic names
                generic_names = ["tool", "action", "do", "run", "execute", "func"]
                if tool.get("name", "").lower() in generic_names:
                    findings.append(
                        Finding(
                            id=f"CD-01-{len(findings) + 1:04d}",
                            control=self.id,
                            severity=Severity.LOW,
                            title=f"Tool '{tool_name}' has generic name",
                            description="Tool names should be descriptive and unambiguous",
                            file="manifest.json",
                            remediation="Use a more specific name that describes what the tool does",
                        )
                    )

        duration = int((time.time() - start) * 1000)

        # Fail only on medium or higher severity findings
        has_blocking = any(f.severity in (Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM) for f in findings)

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if has_blocking else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
        )
