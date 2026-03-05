"""Pytest configuration and shared fixtures."""

import os

import pytest

from mpak import MpakClient
from mpak.types import MpakClientConfig


@pytest.fixture()
def registry_client():
    """MpakClient configured via MPAK_REGISTRY_URL env var (defaults to production)."""
    base_url = os.environ.get("MPAK_REGISTRY_URL", "https://registry.mpak.dev")
    config = MpakClientConfig(base_url=base_url)
    with MpakClient(config) as client:
        yield client
