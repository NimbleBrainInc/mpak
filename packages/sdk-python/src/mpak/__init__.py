"""mpak Python SDK - MCPB bundles and Agent Skills from the mpak registry.

Example:
    >>> from mpak import MpakClient
    >>> client = MpakClient()
    >>> download = client.get_bundle_download("@nimblebraininc/echo")
    >>> print(f"URL: {download.url}")
"""

from mpak.client import MpakClient
from mpak.errors import (
    MpakError,
    MpakIntegrityError,
    MpakNetworkError,
    MpakNotFoundError,
)
from mpak.types import (
    Bundle,
    BundleDetail,
    BundleDownloadResponse,
    BundleSearchResponse,
    BundleVersionDetail,
    BundleVersionsResponse,
    MpakClientConfig,
    Platform,
    Provenance,
)

try:
    from importlib.metadata import version as _get_version

    __version__ = _get_version("mpak")
except Exception:
    __version__ = "0.0.0"

__all__ = [
    "Bundle",
    "BundleDetail",
    "BundleDownloadResponse",
    "BundleSearchResponse",
    "BundleVersionDetail",
    "BundleVersionsResponse",
    "MpakClient",
    "MpakClientConfig",
    "MpakError",
    "MpakIntegrityError",
    "MpakNetworkError",
    "MpakNotFoundError",
    "Platform",
    "Provenance",
]
