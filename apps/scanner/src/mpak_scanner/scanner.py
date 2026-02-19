"""Main scanner module for mpak-scanner."""

import hashlib
import json
import logging
import shutil
import tempfile
import time
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Artifact Integrity
from mpak_scanner.controls.artifact_integrity import (  # noqa: F401
    AI01ValidManifest,
    AI02ContentHashes,
    AI03BundleSignature,
    AI04ReproducibleBuild,
    AI05BundleCompleteness,
)
from mpak_scanner.controls.base import ControlRegistry

# Capability Declaration
from mpak_scanner.controls.capability_declaration import (  # noqa: F401
    CD01ToolDeclaration,
    CD02PermissionScope,
    CD03ToolDescriptionSafety,
    CD04CredentialScope,
    CD05TokenLifetime,
)

# Code Quality
from mpak_scanner.controls.code_quality import (  # noqa: F401
    CQ01NoEmbeddedSecrets,
    CQ02NoMaliciousPatterns,
    CQ03StaticAnalysis,
    CQ04InputValidation,
    CQ05SafeExecution,
    CQ06BehavioralAnalysis,
)

# Provenance
from mpak_scanner.controls.provenance import (  # noqa: F401
    PR01SourceRepository,
    PR02AuthorIdentity,
    PR03BuildAttestation,
    PR04CommitLinkage,
    PR05RepositoryHealth,
)

# Import controls to register them with the ControlRegistry
# Supply Chain
from mpak_scanner.controls.supply_chain import (  # noqa: F401
    SC01SbomGeneration,
    SC02VulnerabilityScan,
    SC03DependencyPinning,
    SC04LockfileIntegrity,
    SC05TrustedSources,
)
from mpak_scanner.models import (
    ControlResult,
    ControlStatus,
    DomainResult,
    SecurityReport,
)

__all__ = ["scan_bundle", "extract_bundle"]

logger = logging.getLogger(__name__)

# Version of the scanner (derived from pyproject.toml via importlib.metadata)
try:
    from importlib.metadata import version as _get_version

    SCANNER_VERSION = _get_version("mpak-scanner")
except Exception:
    SCANNER_VERSION = "0.0.0"

# Domain groupings for controls (matches MTF v0.1 spec)
DOMAINS = {
    "artifact_integrity": ["AI-01", "AI-02", "AI-03", "AI-04", "AI-05"],
    "supply_chain": ["SC-01", "SC-02", "SC-03", "SC-04", "SC-05"],
    "code_quality": ["CQ-01", "CQ-02", "CQ-03", "CQ-04", "CQ-05", "CQ-06"],
    "capability_declaration": ["CD-01", "CD-02", "CD-03", "CD-04", "CD-05"],
    "provenance": ["PR-01", "PR-02", "PR-03", "PR-04", "PR-05"],
}


def compute_bundle_hash(bundle_path: Path) -> str:
    """Compute SHA-256 hash of the bundle file."""
    sha256 = hashlib.sha256()
    with open(bundle_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return f"sha256:{sha256.hexdigest()}"


def extract_bundle(bundle_path: Path, extract_dir: Path) -> dict[str, Any]:
    """Extract MCPB bundle and return metadata.

    Args:
        bundle_path: Path to the .mcpb bundle file
        extract_dir: Directory to extract to

    Returns:
        Dictionary with manifest and file counts
    """
    with zipfile.ZipFile(bundle_path, "r") as zf:
        zf.extractall(extract_dir)

    manifest_path = extract_dir / "manifest.json"
    manifest: dict[str, Any] = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            pass

    return {"manifest": manifest}


def scan_bundle(
    bundle_path: Path | str,
    work_dir: Path | None = None,
    controls: list[str] | None = None,
) -> SecurityReport:
    """Run security scans on an MCP bundle.

    Args:
        bundle_path: Path to the .mcpb bundle file
        work_dir: Optional working directory for extraction. If None, a temp dir is used.
        controls: Optional list of control IDs to run. If None, runs all registered controls.

    Returns:
        SecurityReport with compliance level and all findings
    """
    bundle_path = Path(bundle_path)
    start_time = time.time()

    # Compute bundle hash before extraction
    bundle_hash = compute_bundle_hash(bundle_path)

    # Set up work directory
    cleanup = False
    if work_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix="mpak-scan-"))
        cleanup = True

    try:
        extract_dir = work_dir / "bundle"
        extract_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Extracting bundle to %s", extract_dir)
        metadata = extract_bundle(bundle_path, extract_dir)
        manifest = metadata["manifest"]

        # Initialize report
        report = SecurityReport(
            bundle_name=manifest.get("name", bundle_path.stem),
            bundle_version=manifest.get("version", "unknown"),
            bundle_hash=bundle_hash,
            scan_timestamp=datetime.now(UTC).isoformat(),
            scanner_version=SCANNER_VERSION,
            duration_ms=0,
        )

        # Initialize domain results
        for domain_name in DOMAINS:
            report.domains[domain_name] = DomainResult(domain=domain_name)

        # Get controls to run
        all_controls = ControlRegistry.get_all()
        if controls:
            controls_to_run = {cid: all_controls[cid] for cid in controls if cid in all_controls}
        else:
            controls_to_run = all_controls

        # Run each control
        for control_id, control_class in controls_to_run.items():
            control = control_class()
            logger.info("Running %s: %s", control_id, control.name)

            try:
                result = control.run(extract_dir, manifest)
            except Exception as e:
                logger.exception("Control %s failed with exception", control_id)
                result = ControlResult(
                    control_id=control_id,
                    control_name=control.name,
                    status=ControlStatus.ERROR,
                    error=str(e),
                )

            # Add result to appropriate domain
            domain = control.domain
            if domain in report.domains:
                report.domains[domain].controls[control_id] = result
            else:
                # Create domain if it doesn't exist
                report.domains[domain] = DomainResult(domain=domain)
                report.domains[domain].controls[control_id] = result

        # Calculate SBOM component count from SC-01 results
        supply_chain = report.domains.get("supply_chain", DomainResult("supply_chain"))
        sc01_result = supply_chain.controls.get("SC-01")
        if sc01_result and sc01_result.raw_output:
            report.sbom_component_count = len(sc01_result.raw_output.get("components", []))

        # Set total duration
        report.duration_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "Scan complete. Level: %s, Risk: %s, Duration: %dms",
            report.compliance_level.name_str,
            report.risk_score.value,
            report.duration_ms,
        )

        return report

    finally:
        if cleanup:
            shutil.rmtree(work_dir, ignore_errors=True)
