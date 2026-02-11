# mpak-scanner

Reference implementation of the [mpak Trust Framework (MTF)](https://github.com/NimbleBrainInc/mpak-trust-framework).

**Python**: 3.13+

## Quick Reference

```bash
# Install dependencies
uv sync --dev

# Run scanner
uv run mpak-scanner scan <bundle.mcpb>

# Run tests
uv run pytest
```

## Verification (MUST RUN BEFORE COMPLETING WORK)

**Every task must pass verification before it's considered complete.**

```bash
uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/ && uv run ty check src/ && uv run pytest
```

If verification fails:
```bash
# Fix lint issues
uv run ruff check --fix src/ tests/

# Fix formatting
uv run ruff format src/ tests/

# Fix type errors manually based on ty output
```

**Do not mark a task complete until all checks pass.**

## Project Structure

```
src/mpak_scanner/
├── __init__.py           # Package exports
├── cli.py                # Click CLI (mpak-scanner scan, mpak-scanner job)
├── job.py                # K8s Job mode (S3 download, scan, upload, callback)
├── scanner.py            # Main scan_bundle() function
├── schemas.py            # Schema fetching (from mpaktrust.org, with fallback)
├── models.py             # Data models, compliance calculation
├── rules/                # YAML detection patterns (bundled in wheel)
│   ├── __init__.py       # load_rules() helper
│   ├── unsafe-exec.yaml  # Unsafe execution patterns (CQ-05)
│   ├── malicious.yaml    # Malicious code patterns
│   └── secrets.yaml      # Secret detection patterns
└── controls/             # Security controls by domain
    ├── base.py           # Control base class + registry
    ├── supply_chain/     # SC-01, SC-02, SC-03
    ├── code_quality/     # CQ-01, CQ-02, CQ-03, CQ-05, CQ-06
    ├── artifact_integrity/   # AI-01, AI-02
    ├── provenance/       # PR-01, PR-02
    └── capability_declaration/  # CD-01, CD-02, CD-03

tests/
├── test_scanner.py       # All tests
└── fixtures/             # Test bundles (see fixtures/README.md)
    ├── clean-l1-bundle/      # Passes Level 1
    ├── has-secrets-bundle/   # Fails CQ-01
    ├── invalid-manifest-bundle/  # Fails AI-01
    ├── missing-tools-bundle/     # Fails CD-01
    ├── has-vulns-bundle/     # Fails SC-02
    ├── node-server-bundle/   # Clean Node.js bundle
    └── unsafe-node-bundle/   # Fails CQ-05 (unsafe patterns)
```

## Adding a New Control

1. Create file in appropriate `controls/` subdomain
2. Use `@ControlRegistry.register` decorator
3. Implement `run(bundle_dir, manifest) -> ControlResult`
4. Add tests in `test_scanner.py`
5. Update `CONTROL_LEVELS` in `models.py` if needed

Example:
```python
from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus

@ControlRegistry.register
class SC99NewControl(Control):
    id = "SC-99"
    name = "New Control"
    domain = "supply_chain"
    description = "What this control checks"

    def run(self, bundle_dir: Path, manifest: dict) -> ControlResult:
        # Implementation
        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.PASS,
            findings=[],
        )
```

## External Tools

Controls use these external tools (gracefully skip if not installed):

| Tool | Control | Language | Install |
|------|---------|----------|---------|
| Syft | SC-01 | All | `brew install syft` |
| Grype | SC-02 | All | `brew install grype` |
| TruffleHog | CQ-01 | All | `brew install trufflehog` |
| GuardDog | CQ-02 | Python | `uv pip install guarddog` |
| Bandit | CQ-03 | Python | `uv pip install bandit` |
| ESLint | CQ-03 | JavaScript | `npm install -g eslint eslint-plugin-security` |

## Test Fixtures

Located in `tests/fixtures/`. Each fixture tests specific controls:

- `clean-l1-bundle/` - Valid Python bundle, passes all L1 controls
- `has-secrets-bundle/` - Contains fake secrets (CQ-01 should fail)
- `invalid-manifest-bundle/` - Missing required fields (AI-01 should fail)
- `missing-tools-bundle/` - Tools without descriptions (CD-01 should fail)
- `has-vulns-bundle/` - Vulnerable dependencies (SC-02 should fail)
- `node-server-bundle/` - Clean Node.js bundle, passes CQ-05
- `unsafe-node-bundle/` - Contains unsafe patterns (CQ-05 should fail)

## Releasing a New Version

The scanner is distributed via PyPI. The Docker image installs from PyPI, not local source.

### Steps

1. **Bump version** in three files (must match):
   - `pyproject.toml` (`version = "X.Y.Z"`)
   - `src/mpak_scanner/__init__.py` (`__version__ = "X.Y.Z"`)
   - `src/mpak_scanner/scanner.py` (`SCANNER_VERSION = "X.Y.Z"`)

2. **Update Dockerfile** version pin:
   ```dockerfile
   RUN pip install --no-cache-dir mpak-scanner==X.Y.Z
   ```

3. **Run verification**:
   ```bash
   uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/ && uv run ty check src/ && uv run pytest
   ```

4. **Commit and push** in `apps/mpak`

5. **Publish to PyPI**:
   ```bash
   uv build && uv publish
   ```

6. **Deploy Docker image** (from `hq/deployments/mpak/`):
   ```bash
   make deploy-scanner ENV=production
   make apply-scanner-infra ENV=production  # only if RBAC/secrets changed
   ```

The Makefile pushes both the git commit tag and `latest`. The mpak-api references `latest`, so deploying automatically updates what production uses.

### Schemas and Rules

- **Schemas** (JSON Schema for manifest validation): Fetched at runtime from `mpaktrust.org`. Minimal fallbacks are hardcoded in `schemas.py`. Not bundled in the wheel.
- **Rules** (YAML detection patterns): Bundled in the wheel at `src/mpak_scanner/rules/`. Loaded via `importlib.resources` so they work in any install context. To update rules, publish a new version.

## Architecture Notes

- **This repo**: Reference implementation (Apache 2.0)
- **MTF spec**: [mpak-trust-framework](https://github.com/NimbleBrainInc/mpak-trust-framework) (CC BY 4.0)
- Controls return `ControlResult` with status + findings
- Compliance level calculated from which controls pass
- Risk score calculated from finding severities

## Common Tasks

### Scan a bundle
```bash
uv run mpak-scanner scan /path/to/bundle.mcpb
uv run mpak-scanner scan /path/to/bundle.mcpb --json
```

### Run as a K8s Job
```bash
mpak-scanner job
```

The `job` subcommand is used by the Docker image (default CMD). It reads all config from environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `BUNDLE_S3_BUCKET` | Yes | S3 bucket containing the bundle |
| `BUNDLE_S3_KEY` | Yes | S3 key for the bundle file |
| `SCAN_ID` | Yes | UUID identifying this scan |
| `CALLBACK_URL` | Yes | POST endpoint for results |
| `RESULT_S3_BUCKET` | Yes | Where to upload report JSON |
| `RESULT_S3_PREFIX` | Yes | Key prefix for report upload |
| `AWS_REGION` | No | AWS region (default: us-east-1) |
| `AWS_ACCESS_KEY_ID` | No | IAM credentials (from ExternalSecret) |
| `AWS_SECRET_ACCESS_KEY` | No | IAM credentials (from ExternalSecret) |
| `CALLBACK_SECRET` | No | Sent as `X-Callback-Secret` header |

Requires the `job` extra: `pip install "mpak-scanner[job]"` (adds `boto3`).

### Run specific test
```bash
uv run pytest tests/test_scanner.py::TestCleanL1Bundle -v
```

### Check a specific control
```python
from mpak_scanner.controls.artifact_integrity import AI01ValidManifest
control = AI01ValidManifest()
result = control.run(bundle_dir, manifest)
```
