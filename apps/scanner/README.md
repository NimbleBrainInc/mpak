# mpak-scanner

[![CI](https://github.com/NimbleBrainInc/mpak/actions/workflows/scanner-ci.yml/badge.svg)](https://github.com/NimbleBrainInc/mpak/actions/workflows/scanner-ci.yml)
[![PyPI](https://img.shields.io/pypi/v/mpak-scanner)](https://pypi.org/project/mpak-scanner/)
[![Python](https://img.shields.io/pypi/pyversions/mpak-scanner)](https://pypi.org/project/mpak-scanner/)
[![License](https://img.shields.io/pypi/l/mpak-scanner)](https://github.com/NimbleBrainInc/mpak/blob/main/apps/scanner/LICENSE)

Security scanner for [MCP](https://modelcontextprotocol.io/) bundles (.mcpb). Reference implementation of the [mpak Trust Framework (MTF)](https://mpaktrust.org), an open security standard for MCP server packaging.

Built by [NimbleBrain](https://nimblebrain.ai), mpak-scanner powers the **mpak Certified** verification on the [mpak registry](https://mpak.dev), analyzing bundles for supply chain risks, code quality issues, and compliance with the MTF specification.

## What it does

mpak-scanner analyzes MCP bundles (.mcpb files) for security issues before installation:

- **Supply Chain**: SBOM generation, vulnerability scanning, dependency analysis
- **Code Quality**: Secret detection, malicious pattern detection, static analysis
- **Artifact Integrity**: Manifest validation, content hashes, signatures
- **Provenance**: Source repository verification, author identity, build attestation
- **Capability Declaration**: Tool declarations, permission scopes

## Compliance Levels

The scanner evaluates bundles against four compliance levels defined in the [MTF specification](https://mpaktrust.org):

| Level | Name     | Target                         | Controls |
| ----- | -------- | ------------------------------ | -------- |
| L1    | Basic    | Personal projects              | 6        |
| L2    | Standard | Team tools, published packages | 12       |
| L3    | Verified | Production, enterprise         | 17       |
| L4    | Attested | Critical infrastructure        | 20       |

## Installation

```bash
# Install with uv (recommended)
uv pip install mpak-scanner

# Or with pip
pip install mpak-scanner
```

### External Tools

The scanner integrates with these tools for deeper analysis. Controls gracefully skip if a tool is not installed.

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| [Syft](https://github.com/anchore/syft) | SBOM generation | `brew install syft` |
| [Grype](https://github.com/anchore/grype) | Vulnerability scanning | `brew install grype` |
| [TruffleHog](https://github.com/trufflesecurity/trufflehog) | Secret detection | `brew install trufflehog` |
| [GuardDog](https://github.com/DataDog/guarddog) | Malicious package detection | `uv pip install guarddog` |
| [Bandit](https://github.com/PyCQA/bandit) | Python static analysis | `uv pip install bandit` |
| [ESLint](https://eslint.org/) | JavaScript static analysis | `npm install -g eslint eslint-plugin-security` |

## Usage

### Command Line

```bash
# Scan a bundle
mpak-scanner scan bundle.mcpb

# Output JSON report
mpak-scanner scan bundle.mcpb --json

# Check specific compliance level
mpak-scanner scan bundle.mcpb --level 2
```

### Python API

```python
from mpak_scanner import scan_bundle

report = scan_bundle("bundle.mcpb")
print(f"Compliance Level: {report.compliance_level}")
print(f"Risk Score: {report.risk_score}")

for finding in report.findings:
    print(f"[{finding.severity}] {finding.control}: {finding.message}")
```

## Specification

This scanner implements the [mpak Trust Framework (MTF)](https://mpaktrust.org). See the [full specification](https://github.com/NimbleBrainInc/mpak-trust-framework/blob/main/MTF-0.1.md) for details on compliance levels, controls, and verification methods.

## Development

```bash
# Install dev dependencies
uv sync --dev

# Run all tests
uv run pytest

# Lint and format
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/

# Type check
uv run ty check src/

# Full verification
uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/ && uv run ty check src/ && uv run pytest
```

### Test Fixtures

The scanner ships with test fixtures for validation:

| Fixture | Tests | Expected |
| ------- | ----- | -------- |
| `clean-l1-bundle/` | Valid L1 bundle | All controls pass |
| `has-secrets-bundle/` | CQ-01 detection | Fails with secret findings |
| `invalid-manifest-bundle/` | AI-01 validation | Fails on missing fields |
| `missing-tools-bundle/` | CD-01 validation | Fails on tool issues |
| `has-vulns-bundle/` | SC-02 detection | Fails with CVE findings |
| `node-server-bundle/` | Node.js bundle | All controls pass |
| `unsafe-node-bundle/` | CQ-05 detection | Fails with unsafe patterns |

See [tests/fixtures/README.md](tests/fixtures/README.md) for details.

## Related Projects

- [mpak registry](https://mpak.dev) - Search, download, and publish MCP bundles
- [mpak Trust Framework](https://mpaktrust.org) - The security specification this scanner implements
- [mpak CLI](https://www.npmjs.com/package/@nimblebrain/mpak-cli) - CLI for working with MCP bundles

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to add new controls or improve detection rules.

## License

[Apache License 2.0](LICENSE)
