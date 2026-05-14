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


# ─────────────────────────────────────────────────────────────────────
# MCP Registry (ServerDetail) endpoints
# ─────────────────────────────────────────────────────────────────────


_SERVER_DETAIL: dict = {
    "name": "ai.nimblebrain/echo",
    "title": "Echo",
    "description": "Echo server",
    "version": "0.1.6",
}


@respx.mock
def test_search_servers_returns_list_response():
    """search_servers hits /v1/servers/search and returns the raw JSON envelope."""
    route = respx.get("https://registry.mpak.dev/v1/servers/search", params={"q": "echo"}).mock(
        return_value=Response(200, json={"servers": [_SERVER_DETAIL], "metadata": {"count": 1}})
    )

    client = MpakClient()
    result = client.search_servers(q="echo")

    assert route.called
    assert result["servers"][0]["name"] == "ai.nimblebrain/echo"
    assert result["metadata"]["count"] == 1


@respx.mock
def test_search_servers_passes_limit_and_cursor():
    """Optional pagination params reach the URL untouched."""
    route = respx.get(
        "https://registry.mpak.dev/v1/servers/search",
        params={"limit": "50", "cursor": "100"},
    ).mock(return_value=Response(200, json={"servers": [], "metadata": {"count": 0}}))

    client = MpakClient()
    client.search_servers(limit=50, cursor="100")

    assert route.called


@respx.mock
def test_search_servers_404_raises_not_found():
    respx.get("https://registry.mpak.dev/v1/servers/search").mock(return_value=Response(404))

    client = MpakClient()
    with pytest.raises(MpakNotFoundError):
        client.search_servers()


@respx.mock
def test_get_server_url_encodes_npm_style_name():
    """`@` and `/` in the name are URL-encoded — Fastify's `:name`
    parameter is single-segment, so an unencoded `/` would land on a
    different route and 404 (verified against the live registry).
    Mock at the encoded URL and assert the raw_path the SDK actually
    sent — protects against a regression to unencoded f-strings."""
    route = respx.get("https://registry.mpak.dev/v1/servers/%40nimblebraininc%2Fecho").mock(
        return_value=Response(200, json=_SERVER_DETAIL)
    )

    client = MpakClient()
    result = client.get_server("@nimblebraininc/echo")

    assert route.called
    assert route.calls[0].request.url.raw_path == b"/v1/servers/%40nimblebraininc%2Fecho"
    assert result["name"] == "ai.nimblebrain/echo"


@respx.mock
def test_get_server_url_encodes_reverse_dns_name():
    """The reverse-DNS form has the same `/` separator and needs the
    same encoding."""
    route = respx.get("https://registry.mpak.dev/v1/servers/ai.nimblebrain%2Fecho").mock(
        return_value=Response(200, json=_SERVER_DETAIL)
    )

    client = MpakClient()
    result = client.get_server("ai.nimblebrain/echo")

    assert route.called
    assert route.calls[0].request.url.raw_path == b"/v1/servers/ai.nimblebrain%2Fecho"
    assert result["name"] == "ai.nimblebrain/echo"


@respx.mock
def test_get_server_404_raises_not_found_with_name():
    respx.get("https://registry.mpak.dev/v1/servers/ai.nimblebrain%2Fmissing").mock(
        return_value=Response(404, json={"error": "Not found"})
    )

    client = MpakClient()
    with pytest.raises(MpakNotFoundError) as exc_info:
        client.get_server("ai.nimblebrain/missing")

    # Error message uses the unencoded name (operator-readable).
    assert "ai.nimblebrain/missing" in str(exc_info.value)


@respx.mock
def test_get_server_version_url_encodes_both_segments():
    """Both name and version are URL-encoded; "latest" passes through
    as a literal the registry resolves server-side."""
    route = respx.get("https://registry.mpak.dev/v1/servers/ai.nimblebrain%2Fecho/versions/latest").mock(
        return_value=Response(200, json=_SERVER_DETAIL)
    )

    client = MpakClient()
    result = client.get_server_version("ai.nimblebrain/echo", "latest")

    assert route.called
    assert route.calls[0].request.url.raw_path == b"/v1/servers/ai.nimblebrain%2Fecho/versions/latest"
    assert result["version"] == "0.1.6"


@respx.mock
def test_get_server_version_404_raises_not_found_with_version():
    respx.get("https://registry.mpak.dev/v1/servers/ai.nimblebrain%2Fecho/versions/99.0.0").mock(
        return_value=Response(404)
    )

    client = MpakClient()
    with pytest.raises(MpakNotFoundError) as exc_info:
        client.get_server_version("ai.nimblebrain/echo", "99.0.0")

    assert "ai.nimblebrain/echo@99.0.0" in str(exc_info.value)


# ─────────────────────────────────────────────────────────────────────
# get_server_download — /v1/servers/{name}/versions/{version}/download
# ─────────────────────────────────────────────────────────────────────


_DOWNLOAD_INFO: dict = {
    "url": "https://cdn.example.com/bundle.mcpb",
    "bundle": {
        "name": "@nimblebraininc/echo",
        "version": "0.1.6",
        "platform": {"os": "linux", "arch": "x64"},
        "sha256": "abc123def456",
        "size": 17455747,
    },
    "expires_at": "2026-04-09T12:15:00Z",
}


@respx.mock
def test_get_server_download_returns_download_info():
    """get_server_download hits the new /v1/servers/.../download endpoint."""
    route = respx.get(
        "https://registry.mpak.dev/v1/servers/%40nimblebraininc%2Fecho/versions/0.1.6/download",
        params={"os": "linux", "arch": "x64"},
    ).mock(return_value=Response(200, json=_DOWNLOAD_INFO))

    client = MpakClient()
    download = client.get_server_download("@nimblebraininc/echo", "0.1.6", platform=("linux", "x64"))

    assert route.called
    assert download["url"] == "https://cdn.example.com/bundle.mcpb"
    assert download["bundle"]["sha256"] == "abc123def456"
    assert download["bundle"]["version"] == "0.1.6"


@respx.mock
def test_get_server_download_accepts_reverse_dns_name():
    """Reverse-DNS names are URL-encoded and forwarded; the registry
    resolves them server-side via the reverse-DNS candidate map."""
    route = respx.get(
        "https://registry.mpak.dev/v1/servers/ai.nimblebrain%2Fecho/versions/0.1.6/download",
        params={"os": "linux", "arch": "x64"},
    ).mock(return_value=Response(200, json=_DOWNLOAD_INFO))

    client = MpakClient()
    download = client.get_server_download("ai.nimblebrain/echo", "0.1.6", platform=("linux", "x64"))

    assert route.called
    assert download["bundle"]["name"] == "@nimblebraininc/echo"


@respx.mock
def test_get_server_download_auto_detects_platform_when_omitted():
    """Platform tuple defaults to detect_platform() output."""
    os_name, arch = MpakClient.detect_platform()
    route = respx.get(
        "https://registry.mpak.dev/v1/servers/%40nimblebraininc%2Fecho/versions/latest/download",
        params={"os": os_name, "arch": arch},
    ).mock(return_value=Response(200, json=_DOWNLOAD_INFO))

    client = MpakClient()
    client.get_server_download("@nimblebraininc/echo")

    assert route.called


@respx.mock
def test_get_server_download_404_raises_not_found_with_name_at_version():
    respx.get(
        "https://registry.mpak.dev/v1/servers/ai.nimblebrain%2Fecho/versions/99.0.0/download",
        params={"os": "linux", "arch": "x64"},
    ).mock(return_value=Response(404, json={"error": "Not found"}))

    client = MpakClient()
    with pytest.raises(MpakNotFoundError) as exc_info:
        client.get_server_download("ai.nimblebrain/echo", "99.0.0", platform=("linux", "x64"))

    assert "ai.nimblebrain/echo@99.0.0" in str(exc_info.value)


@respx.mock
def test_get_server_download_500_raises_mpak_error():
    """Non-404 HTTP errors raise MpakError with status code, not MpakNotFoundError."""
    respx.get(
        "https://registry.mpak.dev/v1/servers/%40nimblebraininc%2Fecho/versions/0.1.6/download",
        params={"os": "linux", "arch": "x64"},
    ).mock(return_value=Response(500, text="Internal Server Error"))

    client = MpakClient()
    with pytest.raises(MpakError) as exc_info:
        client.get_server_download("@nimblebraininc/echo", "0.1.6", platform=("linux", "x64"))

    assert not isinstance(exc_info.value, MpakNotFoundError)
    assert exc_info.value.status_code == 500
