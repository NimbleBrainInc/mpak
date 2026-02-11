# Test Fixtures

This directory contains test bundles for validating the mpak-scanner. Each fixture is designed to test specific security controls.

## Fixtures Overview

| Fixture | Purpose | Expected Result |
|---------|---------|-----------------|
| `clean-l1-bundle/` | Valid bundle that passes Level 1 | All L1 controls pass |
| `has-secrets-bundle/` | Contains intentional test secrets | CQ-01 fails |
| `invalid-manifest-bundle/` | Missing required manifest fields | AI-01 fails |
| `missing-tools-bundle/` | Tools without proper declarations | CD-01 fails |
| `has-vulns-bundle/` | Known vulnerable dependencies | SC-02 fails |
| `malicious-test-bundle/` | Legacy test fixture | Various |

## Fixture Details

### clean-l1-bundle

A minimal, valid MCP server bundle that should pass all Level 1 MTF controls:

- **SC-01** (SBOM Generation): Pass
- **CQ-01** (No Secrets): Pass
- **CQ-02** (No Malicious Patterns): Pass
- **AI-01** (Valid Manifest): Pass
- **CD-01** (Tool Declaration): Pass

Contents:
- `manifest.json` - Valid manifest with name, version, mcp_config, tools
- `src/server.py` - Simple echo/add server with no security issues

### has-secrets-bundle

Contains intentional **FAKE** test secrets to verify CQ-01 detection:

**WARNING**: These are NOT real credentials. They are formatted to trigger detection.

- AWS Access Key: `AKIAIOSFODNN7EXAMPLE`
- AWS Secret Key: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
- GitHub Token: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Database URL with password

Expected: CQ-01 should **FAIL** with secret findings.

### invalid-manifest-bundle

Manifest intentionally missing required fields:

- Missing `name`
- Missing `version`
- Missing `mcp_config`

Expected: AI-01 should **FAIL** with findings for each missing field.

### missing-tools-bundle

Tools array with validation issues:

- Tool without `description` (MEDIUM severity)
- Tool with generic name "run" (LOW severity)
- Tool without `name` field (MEDIUM severity)

Expected: CD-01 should **FAIL** due to MEDIUM severity findings.

### has-vulns-bundle

Contains `requirements.txt` with known vulnerable package versions:

| Package | Version | CVE |
|---------|---------|-----|
| urllib3 | 1.26.4 | CVE-2021-33503 |
| py | 1.10.0 | CVE-2022-42969 |
| celery | 5.0.0 | CVE-2021-23727 |
| future | 0.18.2 | CVE-2022-40899 |

Expected: SC-02 should **FAIL** (if Grype is installed).

Note: SC-02 is a Level 2 control. This bundle may still achieve Level 1 if other controls pass.

## Using Fixtures in Tests

```python
from pathlib import Path
import zipfile

FIXTURES_DIR = Path(__file__).parent / "fixtures"

def create_bundle_from_fixture(fixture_name: str, tmp_path: Path) -> Path:
    """Create a .mcpb bundle from a fixture directory."""
    fixture_dir = FIXTURES_DIR / fixture_name
    bundle_path = tmp_path / f"{fixture_name}.mcpb"

    with zipfile.ZipFile(bundle_path, "w") as zf:
        for file in fixture_dir.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(fixture_dir))

    return bundle_path
```

## Adding New Fixtures

When adding a new test fixture:

1. Create a directory with a descriptive name (e.g., `my-test-case/`)
2. Add required files:
   - `manifest.json` - Bundle manifest
   - `src/` - Server source code
   - `deps/` - Dependencies (optional)
3. Document the expected behavior in this README
4. Add corresponding tests in `test_scanner.py`

## Security Note

Test fixtures containing "secrets" or "malicious" patterns use obviously fake/test values. They exist solely to validate scanner detection capabilities. Never use these values in real applications.
