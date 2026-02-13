"""End-to-end tests against real bundles from the mpak registry.

These tests scan real published bundles to catch false positives and
regressions that synthetic fixtures miss.

Setup:
    mpak bundle pull @nimblebraininc/finnhub -o tests/data/finnhub.mcpb
    mpak bundle pull @nimblebraininc/folk -o tests/data/folk.mcpb
    mpak bundle pull @nimblebraininc/nationalparks -o tests/data/nationalparks.mcpb

Run:
    uv run pytest tests/test_e2e_bundles.py -v
    uv run pytest -m e2e -v
"""

from pathlib import Path

import pytest

from mpak_scanner import scan_bundle
from mpak_scanner.models import ControlStatus, Severity

DATA_DIR = Path(__file__).parent / "data"

# Bundle paths
FINNHUB = DATA_DIR / "finnhub.mcpb"
FOLK = DATA_DIR / "folk.mcpb"
NATIONALPARKS = DATA_DIR / "nationalparks.mcpb"

ALL_BUNDLES = [
    pytest.param(FINNHUB, id="finnhub"),
    pytest.param(FOLK, id="folk"),
    pytest.param(NATIONALPARKS, id="nationalparks"),
]

PYTHON_BUNDLES = [
    pytest.param(FINNHUB, id="finnhub"),
    pytest.param(FOLK, id="folk"),
]

NODE_BUNDLES = [
    pytest.param(NATIONALPARKS, id="nationalparks"),
]


def skip_if_missing(bundle_path: Path) -> None:
    if not bundle_path.exists():
        pytest.skip(f"Bundle not found: {bundle_path.name} (run: mpak bundle pull ... -o {bundle_path})")


@pytest.mark.e2e
class TestBundleCompleteness:
    """AI-05: Real bundles should not have false-positive unexpected executables."""

    @pytest.mark.parametrize("bundle", ALL_BUNDLES)
    def test_ai05_passes(self, bundle: Path) -> None:
        """AI-05 should PASS on all published bundles (no false positives)."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        ai05 = report.all_controls.get("AI-05")
        assert ai05 is not None
        assert ai05.status == ControlStatus.PASS, f"AI-05 false positives on {bundle.name}: " + ", ".join(
            f.title for f in ai05.findings if f.severity in {Severity.HIGH, Severity.CRITICAL}
        )

    @pytest.mark.parametrize("bundle", ALL_BUNDLES)
    def test_no_high_or_critical_in_ai05(self, bundle: Path) -> None:
        """AI-05 should have zero HIGH/CRITICAL findings on published bundles."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        ai05 = report.all_controls.get("AI-05")
        assert ai05 is not None
        blocking = [f for f in ai05.findings if f.severity in {Severity.HIGH, Severity.CRITICAL}]
        assert blocking == [], f"Blocking findings on {bundle.name}: {[f.title for f in blocking]}"


@pytest.mark.e2e
class TestManifestValidation:
    """AI-01: Real bundles should have valid manifests."""

    @pytest.mark.parametrize("bundle", ALL_BUNDLES)
    def test_ai01_passes(self, bundle: Path) -> None:
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        ai01 = report.all_controls.get("AI-01")
        assert ai01 is not None
        assert ai01.status == ControlStatus.PASS, f"AI-01 failed on {bundle.name}: {ai01.findings}"


@pytest.mark.e2e
class TestSafeExecution:
    """CQ-05: Real bundles should pass safe execution checks."""

    @pytest.mark.parametrize("bundle", ALL_BUNDLES)
    def test_cq05_passes(self, bundle: Path) -> None:
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        cq05 = report.all_controls.get("CQ-05")
        assert cq05 is not None
        assert cq05.status == ControlStatus.PASS, f"CQ-05 failed on {bundle.name}: {cq05.findings}"


@pytest.mark.e2e
class TestFullScan:
    """Full scan results for each bundle."""

    @pytest.mark.parametrize("bundle", PYTHON_BUNDLES)
    def test_python_bundles_no_critical_findings(self, bundle: Path) -> None:
        """Python bundles should have no CRITICAL findings across all controls."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        critical = []
        for control_id, result in report.all_controls.items():
            for f in result.findings:
                if f.severity == Severity.CRITICAL:
                    critical.append(f"{control_id}: {f.title}")
        assert critical == [], f"Critical findings on {bundle.name}: {critical}"

    @pytest.mark.parametrize("bundle", NODE_BUNDLES)
    def test_node_bundles_no_critical_findings(self, bundle: Path) -> None:
        """Node.js bundles should have no CRITICAL findings across all controls."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        critical = []
        for control_id, result in report.all_controls.items():
            for f in result.findings:
                if f.severity == Severity.CRITICAL:
                    critical.append(f"{control_id}: {f.title}")
        assert critical == [], f"Critical findings on {bundle.name}: {critical}"

    @pytest.mark.parametrize("bundle", ALL_BUNDLES)
    def test_scan_completes_without_errors(self, bundle: Path) -> None:
        """Scanner should not produce ERROR status on any control."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        errors = [f"{cid}: {r.findings}" for cid, r in report.all_controls.items() if r.status == ControlStatus.ERROR]
        assert errors == [], f"Controls errored on {bundle.name}: {errors}"
