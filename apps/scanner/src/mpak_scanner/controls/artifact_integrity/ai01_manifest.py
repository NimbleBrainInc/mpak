"""AI-01: Valid Manifest control.

Per MTF v0.1, AI-01 validates the manifest against:
1. MCPB schema (required for all levels)
2. MTF extension schema (required for L2+)
"""

import time
from pathlib import Path
from typing import Any

import jsonschema
from jsonschema import Draft7Validator

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity
from mpak_scanner.schemas import get_mcpb_schema, get_mtf_schema


@ControlRegistry.register
class AI01ValidManifest(Control):
    """AI-01: Valid Manifest.

    Per MTF spec:
    - Manifest MUST validate against MCPB schema (L1+)
    - Schema validation failure = BLOCK
    - MTF extensions are validated separately for L2+

    This is a foundational control - all other controls depend on valid manifest.
    """

    id = "AI-01"
    name = "Valid Manifest"
    domain = "artifact_integrity"
    description = "Validate manifest.json against MCPB schema"
    level = 1

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Check if manifest exists
        manifest_path = bundle_dir / "manifest.json"
        if not manifest_path.exists():
            findings.append(
                Finding(
                    id="AI-01-0001",
                    control=self.id,
                    severity=Severity.CRITICAL,
                    title="Missing manifest.json",
                    description="Bundle does not contain a manifest.json file",
                    file="manifest.json",
                    remediation="Create a manifest.json file at the bundle root",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        if not manifest:
            findings.append(
                Finding(
                    id="AI-01-0002",
                    control=self.id,
                    severity=Severity.CRITICAL,
                    title="Empty or invalid manifest",
                    description="manifest.json is empty or not valid JSON",
                    file="manifest.json",
                    remediation="Ensure manifest.json contains valid JSON",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        # Step 1: Validate against MCPB schema (required for L1+)
        mcpb_schema = get_mcpb_schema()
        mcpb_errors = self._validate_schema(manifest, mcpb_schema, "MCPB")

        for error in mcpb_errors:
            # Determine severity based on what's missing
            severity = Severity.HIGH if error["required"] else Severity.MEDIUM
            findings.append(
                Finding(
                    id=f"AI-01-{len(findings) + 1:04d}",
                    control=self.id,
                    severity=severity,
                    title=f"Schema validation: {error['field']}",
                    description=error["message"],
                    file="manifest.json",
                    remediation=error.get("remediation", "Fix the schema violation"),
                )
            )

        # Step 2: Check for MTF extensions (informational for L2+ readiness)
        mtf_namespace = manifest.get("_meta", {}).get("org.mpaktrust", {})
        if not mtf_namespace:
            findings.append(
                Finding(
                    id=f"AI-01-{len(findings) + 1:04d}",
                    control=self.id,
                    severity=Severity.INFO,
                    title="No MTF extensions",
                    description="Manifest does not include _meta.org.mpaktrust namespace. "
                    "This is fine for L1, but required for L2+ compliance.",
                    file="manifest.json",
                    remediation="Add _meta.org.mpaktrust for L2+ compliance",
                )
            )
        else:
            # Validate MTF extension structure
            mtf_schema = get_mtf_schema()
            mtf_errors = self._validate_schema(mtf_namespace, mtf_schema, "MTF")
            for error in mtf_errors:
                findings.append(
                    Finding(
                        id=f"AI-01-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.LOW,
                        title=f"MTF extension: {error['field']}",
                        description=error["message"],
                        file="manifest.json",
                    )
                )

        duration = int((time.time() - start) * 1000)

        # Determine pass/fail - only CRITICAL/HIGH failures block L1
        has_blocking = any(f.severity in (Severity.CRITICAL, Severity.HIGH) for f in findings)

        if not has_blocking:
            findings.insert(
                0,
                Finding(
                    id="AI-01-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title="Manifest valid",
                    description="manifest.json validates against MCPB schema",
                ),
            )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if has_blocking else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
        )

    def _validate_schema(self, manifest: dict[str, Any], schema: dict, schema_name: str) -> list[dict[str, Any]]:
        """Validate manifest against a JSON schema.

        Returns list of error dicts with field, message, required, remediation.
        """
        errors: list[dict[str, Any]] = []

        try:
            validator = Draft7Validator(schema)
            for error in validator.iter_errors(manifest):
                field = ".".join(str(p) for p in error.absolute_path) or "(root)"
                is_required = error.validator == "required"

                if is_required:
                    missing = list(error.validator_value)
                    for m in missing:
                        if m not in manifest:
                            errors.append(
                                {
                                    "field": m,
                                    "message": f"Missing required field: {m}",
                                    "required": True,
                                    "remediation": f"Add '{m}' field to manifest.json",
                                }
                            )
                else:
                    errors.append(
                        {
                            "field": field,
                            "message": f"{schema_name} schema: {error.message}",
                            "required": False,
                        }
                    )
        except jsonschema.exceptions.SchemaError as e:
            errors.append(
                {
                    "field": "(schema)",
                    "message": f"Invalid {schema_name} schema: {e.message}",
                    "required": False,
                }
            )

        return errors
