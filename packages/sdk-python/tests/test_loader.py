"""Tests for mpak-loader CLI entry point."""

from unittest.mock import patch

import pytest

from mpak.loader import main


def test_loader_handles_client_init_failure(monkeypatch):
    """BUG-1: If MpakClient() raises, the finally block must not crash with NameError."""
    monkeypatch.setattr("sys.argv", ["mpak-loader", "@scope/name", "/tmp/dest"])

    with patch("mpak.loader.MpakClient", side_effect=RuntimeError("config failure")):
        with pytest.raises(SystemExit) as exc_info:
            main()
        # Should exit with code 1, NOT raise NameError
        assert exc_info.value.code == 1


def test_loader_closes_client_on_success(monkeypatch):
    """Verify client.close() is called after a successful load."""
    monkeypatch.setattr("sys.argv", ["mpak-loader", "@scope/name", "/tmp/dest"])

    mock_client = patch("mpak.loader.MpakClient").start()
    instance = mock_client.return_value
    instance.load_bundle.return_value = {"name": "@scope/name", "version": "1.0.0"}

    with pytest.raises(SystemExit):
        main()

    instance.close.assert_called_once()
    patch.stopall()


def test_loader_closes_client_on_load_failure(monkeypatch):
    """Verify client.close() is called even when load_bundle raises."""
    monkeypatch.setattr("sys.argv", ["mpak-loader", "@scope/name", "/tmp/dest"])

    mock_client = patch("mpak.loader.MpakClient").start()
    instance = mock_client.return_value
    instance.load_bundle.side_effect = RuntimeError("download failed")

    with pytest.raises(SystemExit) as exc_info:
        main()

    assert exc_info.value.code == 1
    instance.close.assert_called_once()
    patch.stopall()


def test_loader_too_few_args(monkeypatch):
    """Verify usage error with too few args."""
    monkeypatch.setattr("sys.argv", ["mpak-loader", "@scope/name"])

    with pytest.raises(SystemExit) as exc_info:
        main()
    assert exc_info.value.code == 1
