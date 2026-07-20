"""Tests for the K8s Job wrapper.

The job decides whether a scan's compliance level is publishable. It is the
producing half of the degraded gate -- the registry only mirrors it -- so the
decision is asserted here against real report shapes.
"""

import json
import sys
import types
from pathlib import Path
from typing import Any

import pytest

from mpak_scanner.job import run_job
from mpak_scanner.models import (
    ControlResult,
    ControlStatus,
    DomainResult,
    SecurityReport,
)

REQUIRED_ENV = {
    "BUNDLE_S3_BUCKET": "bundles",
    "BUNDLE_S3_KEY": "b/test.mcpb",
    "SCAN_ID": "scan-abc",
    "CALLBACK_URL": "https://registry.invalid/app/scan-results",
    "RESULT_S3_BUCKET": "results",
    "RESULT_S3_PREFIX": "reports/",
}

L2_CONTROLS = {
    "AI-01": ControlStatus.PASS,
    "SC-01": ControlStatus.PASS,
    "CQ-01": ControlStatus.PASS,
    "CQ-02": ControlStatus.PASS,
    "CD-01": ControlStatus.PASS,
    "AI-05": ControlStatus.PASS,
    "SC-02": ControlStatus.PASS,
    "SC-03": ControlStatus.PASS,
    "SC-04": ControlStatus.PASS,
    "CQ-03": ControlStatus.PASS,
    "CD-02": ControlStatus.PASS,
    "CD-03": ControlStatus.PASS,
    "PR-01": ControlStatus.PASS,
    "PR-02": ControlStatus.PASS,
}


def _report(overrides: dict[str, ControlStatus]) -> SecurityReport:
    report = SecurityReport(
        bundle_name="@scope/name",
        bundle_version="1.0.0",
        bundle_hash="sha256:abc",
        scan_timestamp="2026-01-01T00:00:00Z",
        scanner_version="test",
        duration_ms=1,
    )
    controls = {cid: ControlResult(cid, cid, status) for cid, status in ({**L2_CONTROLS, **overrides}).items()}
    report.domains["all"] = DomainResult(domain="all", controls=controls)
    return report


class _CapturedCallback:
    """Stands in for urlopen, recording the posted body."""

    def __init__(self) -> None:
        self.payloads: list[dict[str, Any]] = []

    def __call__(self, req: Any, timeout: int = 0) -> Any:  # noqa: ARG002
        self.payloads.append(json.loads(req.data.decode()))

        class _Resp:
            status = 200

            def __enter__(self) -> "_Resp":
                return self

            def __exit__(self, *_: object) -> None:
                return None

        return _Resp()


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> _CapturedCallback:
    """Wire run_job up to stubs for S3, the bundle download, and the callback."""
    for name, value in REQUIRED_ENV.items():
        monkeypatch.setenv(name, value)

    class _S3:
        def download_file(self, _bucket: str, _key: str, dest: str) -> None:
            Path(dest).write_bytes(b"not-a-real-bundle")

        def put_object(self, **_kwargs: object) -> None:
            return None

    # boto3 ships only in the `job` extra, so stub the module rather than making
    # the test suite depend on it. run_job imports it lazily, inside the call.
    fake_boto3 = types.ModuleType("boto3")
    fake_boto3.client = lambda *_a, **_k: _S3()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)

    callback = _CapturedCallback()
    monkeypatch.setattr("mpak_scanner.job.urllib.request.urlopen", callback)
    return callback


class TestDegradedScanIsNotPublished:
    def test_degraded_report_is_reported_as_failed(
        self, captured: _CapturedCallback, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An unmeasured level must not reach the registry as a completed scan."""
        monkeypatch.setattr(
            "mpak_scanner.job.scan_bundle",
            lambda _p: _report({"SC-02": ControlStatus.ERROR}),
        )

        run_job()

        payload = captured.payloads[0]
        assert payload["status"] == "failed"
        assert "SC-02" in payload["error"]
        # The report still ships so the failure can be diagnosed.
        assert payload["report"]["compliance"]["degraded"] is True

    def test_clean_report_is_reported_as_completed(
        self, captured: _CapturedCallback, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A scan where every level-bearing control ran publishes normally."""
        monkeypatch.setattr("mpak_scanner.job.scan_bundle", lambda _p: _report({}))

        run_job()

        payload = captured.payloads[0]
        assert payload["status"] == "completed"
        assert "error" not in payload
        assert payload["report"]["compliance"]["level"] == 2

    def test_genuine_failure_still_publishes(
        self, captured: _CapturedCallback, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A real control failure is a measurement, so its level is published."""
        monkeypatch.setattr(
            "mpak_scanner.job.scan_bundle",
            lambda _p: _report({"SC-02": ControlStatus.FAIL}),
        )

        run_job()

        payload = captured.payloads[0]
        assert payload["status"] == "completed"
        assert payload["report"]["compliance"]["level"] == 1

    def test_error_outside_the_achieved_level_still_publishes(
        self, captured: _CapturedCallback, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An L3-only control erroring says nothing about an L2 bundle."""
        monkeypatch.setattr(
            "mpak_scanner.job.scan_bundle",
            lambda _p: _report({"PR-05": ControlStatus.ERROR}),
        )

        run_job()

        payload = captured.payloads[0]
        assert payload["status"] == "completed"
        assert payload["report"]["compliance"]["level"] == 2
