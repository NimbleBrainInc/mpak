"""Pytest configuration and shared fixtures."""

import pytest


@pytest.fixture
def mock_registry_url():
    """Mock registry URL for testing."""
    return "https://registry.test.mpak.dev"
