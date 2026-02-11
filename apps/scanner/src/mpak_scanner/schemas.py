"""Schema fetching for mpak-scanner.

Fetches MCPB and MTF JSON schemas from mpaktrust.org at runtime.
Falls back to minimal hardcoded schemas if the network is unavailable.
"""

import json
import logging
import urllib.request

logger = logging.getLogger(__name__)

_MCPB_URL = "https://mpaktrust.org/schemas/mcpb/v0.4/manifest.json"
_MTF_URL = "https://mpaktrust.org/schemas/mtf/v0.1/mtf-extension.json"

_MCPB_FALLBACK: dict = {
    "type": "object",
    "required": ["name", "version", "description", "author", "server"],
}

_MTF_FALLBACK: dict = {"type": "object"}

_mcpb_schema: dict | None = None
_mtf_schema: dict | None = None


def _fetch_json(url: str) -> dict | None:
    """Fetch and parse JSON from a URL. Returns None on any failure."""
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})  # noqa: S310
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
            return json.loads(resp.read())
    except Exception:
        logger.debug("Failed to fetch schema from %s", url)
        return None


def get_mcpb_schema() -> dict:
    """Return the MCPB manifest schema (fetched once, then memoized)."""
    global _mcpb_schema
    if _mcpb_schema is None:
        _mcpb_schema = _fetch_json(_MCPB_URL) or _MCPB_FALLBACK
    return _mcpb_schema


def get_mtf_schema() -> dict:
    """Return the MTF extension schema (fetched once, then memoized)."""
    global _mtf_schema
    if _mtf_schema is None:
        _mtf_schema = _fetch_json(_MTF_URL) or _MTF_FALLBACK
    return _mtf_schema
