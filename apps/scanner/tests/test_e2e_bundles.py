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

import os
import shutil
from pathlib import Path

import pytest

from mpak_scanner import SecurityReport, scan_bundle
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


# SC-02 reports real CVEs in these bundles' real dependencies. Those are true
# positives and they move as advisories land, so they are not what this suite
# guards -- which is the analysis controls inventing findings on ordinary code.
CONTROLS_WITH_MOVING_TRUE_POSITIVES = {"SC-02"}


def critical_findings_excluding_true_positives(report: SecurityReport) -> list[str]:
    """Critical findings that would indicate a false positive, not a real CVE."""
    return [
        f"{control_id}: {f.title}"
        for control_id, result in report.all_controls.items()
        if control_id not in CONTROLS_WITH_MOVING_TRUE_POSITIVES
        for f in result.findings
        if f.severity == Severity.CRITICAL
    ]


def skip_if_missing(bundle_path: Path) -> None:
    """Skip when the corpus is absent, unless MPAK_E2E_REQUIRED is set.

    These are the only tests that run the real tools against real bundles, and
    a silent skip is how a regression reaches production with CI green. Setting
    MPAK_E2E_REQUIRED turns a missing corpus into a failure. Nothing sets it
    yet: running this suite in CI also needs the external toolchain, which the
    runner does not have. See #137.
    """
    if bundle_path.exists():
        return
    message = f"Bundle not found: {bundle_path.name} (run: mpak bundle pull ... -o {bundle_path})"
    if os.environ.get("MPAK_E2E_REQUIRED"):
        pytest.fail(message)
    pytest.skip(message)


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

        critical = critical_findings_excluding_true_positives(report)
        assert critical == [], f"Critical findings on {bundle.name}: {critical}"

    @pytest.mark.parametrize("bundle", NODE_BUNDLES)
    def test_node_bundles_no_critical_findings(self, bundle: Path) -> None:
        """Node.js bundles should have no CRITICAL findings across all controls."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        critical = critical_findings_excluding_true_positives(report)
        assert critical == [], f"Critical findings on {bundle.name}: {critical}"

    @pytest.mark.parametrize("bundle", ALL_BUNDLES)
    def test_scan_completes_without_errors(self, bundle: Path) -> None:
        """Scanner should not produce ERROR status on any control."""
        skip_if_missing(bundle)
        report = scan_bundle(bundle)

        errors = [f"{cid}: {r.findings}" for cid, r in report.all_controls.items() if r.status == ControlStatus.ERROR]
        assert errors == [], f"Controls errored on {bundle.name}: {errors}"


@pytest.mark.e2e
class TestCQ03AgainstRealESLint:
    """Drives the real ESLint binary, because the mocked suite cannot see argv.

    Every other CQ-03 test monkeypatches subprocess.run and asserts on the
    arguments, which is how `--no-eslintrc` survived against an ESLint 10 image
    and how `--ext .jsx` without a parser option reached review: both suites
    were green while the invocation was wrong. Only running the tool catches
    that class.
    """

    @staticmethod
    def _require_eslint() -> None:
        if shutil.which("eslint") is None:
            message = "eslint not installed (npm install -g eslint eslint-plugin-security)"
            if os.environ.get("MPAK_E2E_REQUIRED"):
                pytest.fail(message)
            pytest.skip(message)

    def test_real_jsx_component_does_not_false_fail(self, tmp_path: Path) -> None:
        """JSX syntax must parse. Without the parser option it is a fatal error.

        espree cannot read JSX by default, so `--ext .jsx` alone turns every
        genuine component into `fatal: Parsing error`, which this control
        reports as a HIGH finding and fails the bundle on.
        """
        self._require_eslint()
        (tmp_path / "server.js").write_text("const a = 1;\n")
        (tmp_path / "App.jsx").write_text("const App = () => <div>hi</div>;\nexport default App;\n")

        from mpak_scanner.controls.code_quality import CQ03StaticAnalysis

        result = CQ03StaticAnalysis().run(tmp_path, {})

        assert result.status == ControlStatus.PASS, (
            f"a benign JSX component failed CQ-03: {[(f.severity.value, f.title) for f in result.findings]}"
        )

    def test_real_jsx_payload_is_still_detected(self, tmp_path: Path) -> None:
        """Parsing JSX must not come at the cost of analysing it."""
        self._require_eslint()
        (tmp_path / "Evil.jsx").write_text("const P = () => <b>{eval(process.env.P)}</b>;\nexport default P;\n")

        from mpak_scanner.controls.code_quality import CQ03StaticAnalysis

        result = CQ03StaticAnalysis().run(tmp_path, {})

        assert result.status == ControlStatus.FAIL
        assert any("detect-eval-with-expression" in f.title for f in result.findings)

    def test_real_js_payload_is_detected(self, tmp_path: Path) -> None:
        """The baseline the flag fix exists to preserve."""
        self._require_eslint()
        (tmp_path / "server.js").write_text("const x = eval(process.argv[2]);\n")

        from mpak_scanner.controls.code_quality import CQ03StaticAnalysis

        result = CQ03StaticAnalysis().run(tmp_path, {})

        assert result.status == ControlStatus.FAIL
