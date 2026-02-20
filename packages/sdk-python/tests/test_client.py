"""Tests for MpakClient."""

import io
import json
import zipfile

import pytest
import respx
from httpx import Response

from mpak import MpakClient, MpakClientConfig, MpakError, MpakNotFoundError


@respx.mock
def test_get_bundle_download():
    """Test getting bundle download info."""
    # Mock the registry API response
    mock_response = {
        "url": "https://cdn.example.com/bundle.mcpb",
        "bundle": {
            "name": "@test/echo",
            "version": "1.0.0",
            "platform": {"os": "linux", "arch": "x64"},
            "sha256": "abc123def456",
            "size": 1024,
        },
    }

    respx.get("https://registry.mpak.dev/v1/bundles/@test/echo/versions/latest/download").mock(
        return_value=Response(200, json=mock_response)
    )

    client = MpakClient()
    download = client.get_bundle_download("@test/echo", platform=("linux", "x64"))

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
        client.get_bundle_download("@test/missing", platform=("linux", "x64"))

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
    assert arch in ("x64", "arm64")


@respx.mock
def test_get_bundle_download_500_raises_mpak_error():
    """Non-404 HTTP errors should raise MpakError with status code, not MpakNotFoundError."""
    respx.get("https://registry.mpak.dev/v1/bundles/@test/broken/versions/latest/download").mock(
        return_value=Response(500, text="Internal Server Error")
    )

    client = MpakClient()
    with pytest.raises(MpakError) as exc_info:
        client.get_bundle_download("@test/broken", platform=("linux", "x64"))

    assert not isinstance(exc_info.value, MpakNotFoundError)
    assert exc_info.value.status_code == 500


def _make_zip(files: dict[str, str]) -> bytes:
    """Create an in-memory zip with the given filename->content pairs."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


@respx.mock
def test_load_bundle_from_url_rejects_zip_slip(tmp_path):
    """SECURITY-1: Zip entries with path traversal must be rejected before extraction."""
    malicious_zip = _make_zip({"../../etc/evil.txt": "pwned"})
    respx.get("https://cdn.example.com/evil.mcpb").mock(return_value=Response(200, content=malicious_zip))

    client = MpakClient()
    dest = tmp_path / "bundle_dest"

    with pytest.raises(ValueError, match="Zip slip attempt detected"):
        client.load_bundle_from_url("https://cdn.example.com/evil.mcpb", dest)

    # Verify nothing was written outside dest
    assert not (tmp_path / "etc").exists()
    assert not (tmp_path / "evil.txt").exists()


@respx.mock
def test_load_bundle_from_url_extracts_safe_zip(tmp_path):
    """Safe zip files should extract normally and return the manifest."""
    manifest = {"name": "@test/echo", "version": "1.0.0"}
    safe_zip = _make_zip(
        {
            "manifest.json": json.dumps(manifest),
            "server.py": "print('hello')",
        }
    )

    respx.get("https://cdn.example.com/echo.mcpb").mock(return_value=Response(200, content=safe_zip))

    client = MpakClient()
    dest = tmp_path / "bundle_dest"
    result = client.load_bundle_from_url("https://cdn.example.com/echo.mcpb", dest)

    assert result["name"] == "@test/echo"
    assert result["version"] == "1.0.0"
    assert (dest / "server.py").exists()
    # bundle.mcpb should be cleaned up after extraction
    assert not (dest / "bundle.mcpb").exists()


@respx.mock
def test_load_bundle_from_url_uses_configured_client(tmp_path):
    """DESIGN-1: Bundle downloads should use the configured client (User-Agent, etc.)."""
    manifest = {"name": "@test/echo", "version": "1.0.0"}
    safe_zip = _make_zip({"manifest.json": json.dumps(manifest)})

    route = respx.get("https://cdn.example.com/echo.mcpb").mock(return_value=Response(200, content=safe_zip))

    config = MpakClientConfig(user_agent="test-agent/2.0")
    client = MpakClient(config)
    client.load_bundle_from_url("https://cdn.example.com/echo.mcpb", tmp_path / "dest")

    # Verify the request used the configured User-Agent
    assert route.called
    request = route.calls[0].request
    assert request.headers["user-agent"] == "test-agent/2.0"
