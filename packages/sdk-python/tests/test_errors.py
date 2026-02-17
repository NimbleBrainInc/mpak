"""Tests for error hierarchy."""

from mpak.errors import (
    MpakError,
    MpakIntegrityError,
    MpakNetworkError,
    MpakNotFoundError,
)


def test_mpak_error():
    """Test base MpakError."""
    err = MpakError("test message", "TEST_CODE", 500)
    assert str(err) == "test message"
    assert err.message == "test message"
    assert err.code == "TEST_CODE"
    assert err.status_code == 500


def test_not_found_error():
    """Test MpakNotFoundError."""
    err = MpakNotFoundError("@scope/package")
    assert "Resource not found" in str(err)
    assert err.resource == "@scope/package"
    assert err.code == "NOT_FOUND"
    assert err.status_code == 404


def test_integrity_error():
    """Test MpakIntegrityError."""
    err = MpakIntegrityError("abc123", "def456")
    assert "Integrity mismatch" in str(err)
    assert err.expected == "abc123"
    assert err.actual == "def456"
    assert err.code == "INTEGRITY_MISMATCH"


def test_network_error():
    """Test MpakNetworkError."""
    err = MpakNetworkError("Connection timeout")
    assert "Connection timeout" in str(err)
    assert err.code == "NETWORK_ERROR"


def test_error_inheritance():
    """Test that all errors inherit from MpakError."""
    assert issubclass(MpakNotFoundError, MpakError)
    assert issubclass(MpakIntegrityError, MpakError)
    assert issubclass(MpakNetworkError, MpakError)
