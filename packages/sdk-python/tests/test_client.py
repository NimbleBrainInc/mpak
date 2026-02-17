"""Tests for MpakClient."""

import pytest
import respx
from httpx import Response

from mpak import MpakClient, MpakClientConfig, MpakNotFoundError


@respx.mock
def test_get_bundle_download():
    """Test getting bundle download info."""
    # Mock the registry API response
    mock_response = {
        "url": "https://cdn.example.com/bundle.mcpb",
        "bundle": {
            "name": "@test/echo",
            "version": "1.0.0",
            "platform": {"os": "linux", "arch": "amd64"},
            "sha256": "abc123def456",
            "size": 1024,
        },
    }

    respx.get("https://registry.mpak.dev/v1/bundles/@test/echo/versions/latest/download").mock(
        return_value=Response(200, json=mock_response)
    )

    client = MpakClient()
    download = client.get_bundle_download("@test/echo", platform=("linux", "amd64"))

    assert download.url == "https://cdn.example.com/bundle.mcpb"
    assert download.bundle.sha256 == "abc123def456"
    assert download.bundle.version == "1.0.0"


@respx.mock
def test_get_bundle_download_not_found():
    """Test getting bundle download when package not found."""
    respx.get("https://registry.mpak.dev/v1/bundles/@test/missing/versions/latest/download").mock(
        return_value=Response(404, json={"error": "Not found"})
    )

    client = MpakClient()
    with pytest.raises(MpakNotFoundError) as exc_info:
        client.get_bundle_download("@test/missing", platform=("linux", "amd64"))

    assert "@test/missing" in str(exc_info.value)


def test_parse_package_name():
    """Test package name parsing."""
    client = MpakClient()

    # Valid names
    assert client._parse_package_name("@scope/name") == ("scope", "name")
    assert client._parse_package_name("@org/my-package") == ("org", "my-package")

    # Invalid names
    with pytest.raises(ValueError, match="must start with @"):
        client._parse_package_name("invalid")

    with pytest.raises(ValueError, match="must be @scope/name"):
        client._parse_package_name("@invalid")


def test_client_config():
    """Test client configuration."""
    config = MpakClientConfig(
        base_url="https://custom.registry.dev",
        timeout=60.0,
        user_agent="test/1.0",
    )

    client = MpakClient(config)
    assert client.config.base_url == "https://custom.registry.dev"
    assert client.config.timeout == 60.0
    assert client.config.user_agent == "test/1.0"


def test_detect_platform_static_method():
    """Test static platform detection method."""
    os_name, arch = MpakClient.detect_platform()
    assert os_name in ("linux", "darwin", "win32")
    assert arch in ("amd64", "arm64")
