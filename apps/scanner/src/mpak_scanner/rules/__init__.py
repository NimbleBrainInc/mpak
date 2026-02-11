"""Rule loading for mpak-scanner."""

import importlib.resources

import yaml


def load_rules(filename: str) -> dict:
    """Load a YAML rules file bundled with the package.

    Args:
        filename: Name of the YAML file (e.g. "unsafe-exec.yaml").

    Returns:
        Parsed YAML content as a dict.
    """
    source = importlib.resources.files("mpak_scanner.rules").joinpath(filename)
    return yaml.safe_load(source.read_text(encoding="utf-8"))
