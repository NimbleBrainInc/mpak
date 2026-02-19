# mpak Python SDK

[![CI](https://github.com/NimbleBrainInc/mpak/actions/workflows/sdk-python-ci.yml/badge.svg)](https://github.com/NimbleBrainInc/mpak/actions/workflows/sdk-python-ci.yml)
[![PyPI](https://img.shields.io/pypi/v/mpak)](https://pypi.org/project/mpak/)
[![Python](https://img.shields.io/pypi/pyversions/mpak)](https://pypi.org/project/mpak/)
[![License](https://img.shields.io/pypi/l/mpak)](https://github.com/NimbleBrainInc/mpak/blob/main/packages/sdk-python/LICENSE)
[![mpak.dev](https://mpak.dev/badge.svg)](https://mpak.dev)

Python SDK for the mpak registry - search, download, and resolve MCPB bundles and Agent Skills.

## Installation

```bash
pip install mpak
```

## Quick Start

```python
from mpak import MpakClient

# Create client
client = MpakClient()

# Resolve a bundle to download URL
download = client.get_bundle_download("@nimblebraininc/echo", version="latest")
print(f"Download URL: {download.url}")
print(f"SHA256: {download.sha256}")

# Download and extract a bundle
manifest = client.load_bundle("@nimblebraininc/echo", dest="/app/bundle")
print(f"Loaded: {manifest['name']} v{manifest['version']}")
```

## CLI Usage

The package provides a `mpak-loader` CLI that replaces the standalone `mcpb-loader.py` script:

```bash
# Load from mpak registry
mpak-loader @nimblebraininc/echo /dest/dir

# Load specific version
mpak-loader @nimblebraininc/echo@1.0.0 /dest/dir

# Load from direct URL with SHA256 verification
mpak-loader https://example.com/bundle.mcpb /dest/dir abc123...
```

## Development

### Setup

```bash
# Install with dev dependencies
uv pip install -e ".[dev]"

# Generate types from OpenAPI spec
python scripts/generate-types.py
```

### Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=mpak --cov-report=html

# Lint and format
ruff check .
ruff format .
```

## Type Generation

The SDK types are generated from the mpak registry OpenAPI spec. To regenerate:

```bash
python scripts/generate-types.py
```

This fetches the latest spec from `https://registry.mpak.dev/docs/json` and generates Pydantic models in `src/mpak/generated/types.py`.

## License

Apache-2.0
