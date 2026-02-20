"""Integration tests that hit the live mpak registry at registry.mpak.dev.

Run with: pytest -m integration
Skip with: pytest -m "not integration"
"""

import shutil
import tempfile
from pathlib import Path

import pytest

from mpak import MpakClient, MpakNotFoundError
from mpak.types import BundleDownloadResponse

# Well-known bundle that exists on the registry
TEST_PACKAGE = "@nimblebraininc/echo"

pytestmark = pytest.mark.integration


class TestGetBundleDownload:
    """Tests for resolving bundle download metadata from the live registry."""

    def test_resolve_latest_version(self):
        """get_bundle_download returns a valid download URL and SHA256 for latest."""
        with MpakClient() as client:
            download = client.get_bundle_download(TEST_PACKAGE)

        assert isinstance(download, BundleDownloadResponse)
        assert download.url.startswith("https://")
        assert download.url.endswith(".mcpb")
        assert download.bundle.name == TEST_PACKAGE
        assert download.bundle.sha256
        assert len(download.bundle.sha256) == 64  # hex SHA256
        assert download.bundle.version  # non-empty
        assert download.bundle.size > 0

    def test_resolve_specific_version(self):
        """get_bundle_download works with a pinned version."""
        with MpakClient() as client:
            download = client.get_bundle_download(TEST_PACKAGE, version="0.1.5")

        assert download.bundle.version == "0.1.5"
        assert download.bundle.sha256
        assert download.url.endswith(".mcpb")

    def test_resolve_with_explicit_platform(self):
        """get_bundle_download accepts an explicit platform tuple."""
        with MpakClient() as client:
            download = client.get_bundle_download(
                TEST_PACKAGE,
                platform=("linux", "arm64"),
            )

        assert "linux" in download.url
        assert "arm64" in download.url

    def test_not_found_package(self):
        """get_bundle_download raises MpakNotFoundError for non-existent packages."""
        with MpakClient() as client:
            with pytest.raises(MpakNotFoundError):
                client.get_bundle_download("@test/this-package-does-not-exist-xyz")

    def test_not_found_version(self):
        """get_bundle_download raises MpakNotFoundError for non-existent versions."""
        with MpakClient() as client:
            with pytest.raises(MpakNotFoundError):
                client.get_bundle_download(TEST_PACKAGE, version="99.99.99")


class TestLoadBundle:
    """Tests for the full download + extract + verify pipeline."""

    def test_load_bundle_end_to_end(self):
        """load_bundle downloads, verifies SHA256, extracts, and returns manifest."""
        dest = Path(tempfile.mkdtemp(prefix="mpak-test-"))
        try:
            with MpakClient() as client:
                manifest = client.load_bundle(TEST_PACKAGE, dest)

            # Manifest has expected fields
            assert manifest["name"] == TEST_PACKAGE
            assert "version" in manifest
            assert "server" in manifest

            # Bundle was extracted (manifest.json + at least deps or server files)
            assert (dest / "manifest.json").exists()
            extracted_files = list(dest.iterdir())
            assert len(extracted_files) >= 2  # manifest.json + something else
        finally:
            shutil.rmtree(dest, ignore_errors=True)

    def test_load_bundle_specific_version(self):
        """load_bundle works with a pinned version."""
        dest = Path(tempfile.mkdtemp(prefix="mpak-test-"))
        try:
            with MpakClient() as client:
                manifest = client.load_bundle(TEST_PACKAGE, dest, version="0.1.5")

            assert manifest["version"] == "0.1.5"
            assert (dest / "manifest.json").exists()
        finally:
            shutil.rmtree(dest, ignore_errors=True)


class TestPlatformDetection:
    """Verify platform detection produces values the registry accepts."""

    def test_detected_platform_resolves_a_bundle(self):
        """The auto-detected platform should resolve a real bundle."""
        with MpakClient() as client:
            os_name, arch = client.detect_platform()
            download = client.get_bundle_download(TEST_PACKAGE, platform=(os_name, arch))

        assert os_name in download.url
        assert arch in download.url
