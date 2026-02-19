"""SDK-specific types and re-exports from generated types."""

from dataclasses import dataclass, field

# Re-export commonly used generated types
from mpak.generated.types import (
    Bundle,
    Platform,
    Provenance,
)
from mpak.generated.types import (
    V1BundlesScopePackageGetResponse as BundleDetail,
)
from mpak.generated.types import (
    V1BundlesScopePackageVersionsGetResponse as BundleVersionsResponse,
)
from mpak.generated.types import (
    V1BundlesScopePackageVersionsVersionDownloadGetResponse as BundleDownloadResponse,
)
from mpak.generated.types import (
    V1BundlesScopePackageVersionsVersionGetResponse as BundleVersionDetail,
)
from mpak.generated.types import (
    V1BundlesSearchGetResponse as BundleSearchResponse,
)

__all__ = [
    "Bundle",
    "BundleDetail",
    "BundleDownloadResponse",
    "BundleSearchResponse",
    "BundleVersionDetail",
    "BundleVersionsResponse",
    "MpakClientConfig",
    "Platform",
    "Provenance",
]


@dataclass
class MpakClientConfig:
    """Configuration for MpakClient.

    Attributes:
        base_url: Base URL for mpak registry API (default: https://registry.mpak.dev)
        timeout: Request timeout in seconds (default: 30)
        user_agent: User-Agent header (default: mpak-python/{version})
    """

    base_url: str = "https://registry.mpak.dev"
    timeout: float = 30.0
    user_agent: str = field(default_factory=lambda: f"mpak-python/{_get_version()}")


def _get_version() -> str:
    try:
        from importlib.metadata import version

        return version("mpak")
    except Exception:
        return "0.0.0"
