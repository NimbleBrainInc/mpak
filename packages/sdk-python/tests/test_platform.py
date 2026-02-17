"""Tests for platform detection."""

from mpak._platform import detect_platform


def test_detect_platform():
    """Test that platform detection returns valid values."""
    os_name, arch = detect_platform()

    # Should return known OS values
    assert os_name in ("linux", "darwin", "win32"), f"Unknown OS: {os_name}"

    # Should return known arch values
    assert arch in ("amd64", "arm64"), f"Unknown arch: {arch}"


def test_detect_platform_type():
    """Test that platform detection returns correct types."""
    os_name, arch = detect_platform()

    assert isinstance(os_name, str)
    assert isinstance(arch, str)
    assert len(os_name) > 0
    assert len(arch) > 0
