"""mpak-scanner: Security scanner for MCP bundles."""

from mpak_scanner.models import ComplianceLevel, ControlResult, SecurityReport
from mpak_scanner.scanner import scan_bundle

try:
    from importlib.metadata import version as _get_version

    __version__ = _get_version("mpak-scanner")
except Exception:
    __version__ = "0.0.0"

__all__ = ["scan_bundle", "SecurityReport", "ControlResult", "ComplianceLevel"]
