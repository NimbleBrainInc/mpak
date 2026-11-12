"""The scan command's output streams: stdout carries only the report.

CI pipelines redirect `mpak-scanner scan --json` to a file and parse it, so any
status line written to stdout breaks the report. These tests hold the split:
the report on stdout, progress and status on stderr.
"""

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from mpak_scanner import cli
from mpak_scanner.models import SecurityReport


def _report() -> SecurityReport:
    return SecurityReport(
        bundle_name="@scope/name",
        bundle_version="1.0.0",
        bundle_hash="sha256:abc",
        scan_timestamp="2026-01-01T00:00:00Z",
        scanner_version="test",
        duration_ms=1,
    )


@pytest.fixture
def bundle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "bundle.mcpb"
    path.write_bytes(b"")
    monkeypatch.setattr(cli, "scan_bundle", lambda _bundle: _report())
    return path


def test_json_stdout_is_only_the_report(bundle: Path) -> None:
    result = CliRunner().invoke(cli.main, ["scan", str(bundle), "--json"])

    report = json.loads(result.stdout)
    assert report["bundle"]["name"] == "@scope/name"
    assert "Scanning" in result.stderr


def test_json_with_output_file_writes_nothing_to_stdout(bundle: Path, tmp_path: Path) -> None:
    out = tmp_path / "report.json"
    result = CliRunner().invoke(cli.main, ["scan", str(bundle), "--json", "-o", str(out)])

    assert result.stdout == ""
    assert json.loads(out.read_text())["bundle"]["name"] == "@scope/name"
    assert f"Report saved to {out}" in result.stderr


def test_json_stdout_stays_valid_when_the_level_gate_fails(bundle: Path) -> None:
    result = CliRunner().invoke(cli.main, ["scan", str(bundle), "--json", "--level", "4"])

    assert result.exit_code == 1
    json.loads(result.stdout)
    assert "FAIL: Bundle does not meet minimum compliance level 4" in result.stderr


def test_readable_report_stays_on_stdout(bundle: Path) -> None:
    result = CliRunner().invoke(cli.main, ["scan", str(bundle)])

    assert "mpak Security Report: @scope/name" in result.stdout
    assert "Scanning" not in result.stdout
    assert "Full report saved to:" in result.stderr
