# Contributing to mpak-scanner

Thank you for your interest in contributing to mpak-scanner!

## Adding a New Control

Controls are organized by security domain in `src/mpak_scanner/controls/`.

### 1. Create the Control File

```python
# src/mpak_scanner/controls/{domain}/{control_id}.py

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

@ControlRegistry.register
class MyNewControl(Control):
    """Control description."""

    id = "XX-01"  # Follow MTF naming: SC, CQ, AI, PR, CD
    name = "Human Readable Name"
    domain = "domain_name"  # supply_chain, code_quality, etc.
    description = "What this control checks"

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        # Implementation
        findings: list[Finding] = []

        # ... check logic ...

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.PASS,  # or FAIL
            findings=findings,
            duration_ms=duration,
        )
```

### 2. Register in Domain **init**.py

```python
# src/mpak_scanner/controls/{domain}/__init__.py

from mpak_scanner.controls.{domain}.{control_id} import MyNewControl

__all__ = [..., "MyNewControl"]
```

### 3. Import in Scanner

```python
# src/mpak_scanner/scanner.py

from mpak_scanner.controls.{domain} import MyNewControl
```

### 4. Add to CONTROL_LEVELS

If the control should be required at specific compliance levels, add it to the `CONTROL_LEVELS` dict in `models.py`.

### 5. Write Tests

```python
# tests/test_{control_id}.py

def test_control_passes():
    ...

def test_control_fails():
    ...
```

## Adding Detection Rules

Detection rules for patterns like secrets or malicious code are in `rules/`.

Rules use YAML format:

```yaml
# rules/my-patterns.yaml
patterns:
  - name: pattern-name
    pattern: "regex pattern"
    severity: high
    message: "Description of what was found"
```

## Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=mpak_scanner

# Run specific test
pytest tests/test_scanner.py -k test_scan_bundle
```

## Code Style

We use ruff for linting and formatting:

```bash
ruff check src/
ruff format src/
```

Type checking with ty:

```bash
uv run ty check src/
```

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Add tests for new functionality
3. Ensure all tests pass
4. Update documentation if needed
5. Submit PR with clear description
