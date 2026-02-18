"""mpak SDK client for bundle and skill resolution."""

import json
import zipfile
from pathlib import Path
from typing import Any

import httpx

from mpak._integrity import verify_integrity
from mpak._platform import detect_platform
from mpak.errors import MpakError, MpakNetworkError, MpakNotFoundError
from mpak.types import BundleDownloadResponse, MpakClientConfig


class MpakClient:
    """Client for interacting with the mpak registry.

    This client provides methods to search, resolve, and download MCPB bundles
    and Agent Skills from the mpak registry.

    Example:
        >>> client = MpakClient()
        >>> download = client.get_bundle_download("@nimblebraininc/echo")
        >>> print(f"URL: {download.url}, SHA256: {download.bundle.sha256}")
    """

    def __init__(self, config: MpakClientConfig | None = None):
        """Initialize the mpak client.

        Args:
            config: Client configuration. If None, uses defaults.
        """
        self.config = config or MpakClientConfig()
        self._client = httpx.Client(
            base_url=self.config.base_url,
            timeout=self.config.timeout,
            headers={
                "User-Agent": self.config.user_agent,
                "Accept": "application/json",
            },
            follow_redirects=True,
        )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    @staticmethod
    def detect_platform() -> tuple[str, str]:
        """Detect the current platform (OS and architecture).

        Returns:
            Tuple of (os, arch) suitable for bundle resolution.

        Example:
            >>> MpakClient.detect_platform()
            ('darwin', 'arm64')
        """
        return detect_platform()

    def get_bundle_download(
        self,
        package: str,
        version: str = "latest",
        platform: tuple[str, str] | None = None,
    ) -> BundleDownloadResponse:
        """Get download information for a bundle version.

        Args:
            package: Scoped package name (e.g., "@nimblebraininc/echo")
            version: Version to download (default: "latest")
            platform: Tuple of (os, arch). If None, auto-detects current platform.

        Returns:
            BundleDownloadResponse with URL, SHA256, and bundle metadata

        Raises:
            MpakNotFoundError: If package or version not found
            MpakNetworkError: If network request fails
            ValueError: If package name is not scoped (@scope/name)
        """
        if not package.startswith("@"):
            raise ValueError(f"Package name must be scoped (@scope/name): {package}")

        # Parse package name
        scope, name = self._parse_package_name(package)

        # Auto-detect platform if not provided
        if platform is None:
            platform = detect_platform()
        os_name, arch = platform

        # Make API request
        url = f"/v1/bundles/@{scope}/{name}/versions/{version}/download"
        params = {"os": os_name, "arch": arch}

        try:
            response = self._client.get(url, params=params)
            if response.status_code == 404:
                raise MpakNotFoundError(f"{package}@{version} ({os_name}/{arch})")
            response.raise_for_status()
            data = response.json()
            return BundleDownloadResponse.model_validate(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise MpakNotFoundError(f"{package}@{version} ({os_name}/{arch})") from e
            raise MpakError(
                f"HTTP {e.response.status_code}: {e.response.text}",
                "HTTP_ERROR",
                e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise MpakNetworkError(f"Network error: {e}") from e

    def load_bundle(
        self,
        package: str,
        dest: str | Path,
        version: str = "latest",
        platform: tuple[str, str] | None = None,
    ) -> dict[str, Any]:
        """Download and extract a bundle from the mpak registry.

        This is a convenience method that:
        1. Resolves the package to a download URL via the registry
        2. Downloads the bundle
        3. Verifies SHA256 integrity
        4. Extracts to dest
        5. Returns the parsed manifest

        Args:
            package: Scoped package name (e.g., "@nimblebraininc/echo")
            dest: Destination directory for bundle extraction
            version: Version to download (default: "latest")
            platform: Tuple of (os, arch). If None, auto-detects current platform.

        Returns:
            Parsed manifest.json as a dictionary

        Raises:
            MpakNotFoundError: If package or version not found
            MpakIntegrityError: If SHA256 verification fails
            MpakNetworkError: If download fails
            ValueError: If package name is invalid
        """
        # Resolve to download URL
        download_info = self.get_bundle_download(package, version, platform)

        # Download and extract
        return self.load_bundle_from_url(
            download_info.url,
            dest,
            expected_sha256=download_info.bundle.sha256,
        )

    def load_bundle_from_url(
        self,
        url: str,
        dest: str | Path,
        expected_sha256: str | None = None,
    ) -> dict[str, Any]:
        """Download and extract a bundle from a direct URL.

        Args:
            url: Direct URL to bundle file (.mcpb)
            dest: Destination directory for bundle extraction
            expected_sha256: Expected SHA256 hash for verification (optional but recommended)

        Returns:
            Parsed manifest.json as a dictionary

        Raises:
            MpakIntegrityError: If SHA256 verification fails
            MpakNetworkError: If download fails
            FileNotFoundError: If manifest.json not found in bundle
        """
        dest_path = Path(dest)
        dest_path.mkdir(parents=True, exist_ok=True)

        bundle_path = dest_path / "bundle.mcpb"

        # Download bundle
        print(f"Downloading bundle from {url}...")
        try:
            with httpx.stream("GET", url, follow_redirects=True, timeout=self.config.timeout) as response:
                response.raise_for_status()
                total_bytes = 0
                with open(bundle_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        f.write(chunk)
                        total_bytes += len(chunk)
                size_mb = total_bytes / 1024 / 1024
                print(f"Downloaded {size_mb:.1f}MB")
        except httpx.RequestError as e:
            if bundle_path.exists():
                bundle_path.unlink()
            raise MpakNetworkError(f"Download failed: {e}") from e

        # Verify SHA256 if expected hash is provided
        if expected_sha256:
            print(f"Verifying SHA256: {expected_sha256[:16]}...")
            try:
                verify_integrity(bundle_path, expected_sha256)
                print("✓ SHA256 verified")
            except Exception:
                # Clean up invalid bundle
                bundle_path.unlink()
                raise
        else:
            print("⚠ Warning: No SHA256 hash provided, skipping integrity verification")

        # Extract bundle
        print(f"Extracting to {dest_path}...")
        with zipfile.ZipFile(bundle_path, "r") as zf:
            zf.extractall(dest_path)

        # Clean up bundle file
        bundle_path.unlink()

        # Parse manifest
        manifest_path = dest_path / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError("No manifest.json found in bundle")

        manifest = json.loads(manifest_path.read_text())
        print(f"Loaded: {manifest['name']} v{manifest['version']}")
        return manifest

    @staticmethod
    def _parse_package_name(package: str) -> tuple[str, str]:
        """Parse a scoped package name into scope and name.

        Args:
            package: Package name like "@scope/name"

        Returns:
            Tuple of (scope, name)

        Raises:
            ValueError: If package name is not properly scoped
        """
        if not package.startswith("@"):
            raise ValueError(f"Package name must start with @: {package}")
        parts = package[1:].split("/", 1)
        if len(parts) != 2:
            raise ValueError(f"Package name must be @scope/name: {package}")
        return parts[0], parts[1]
