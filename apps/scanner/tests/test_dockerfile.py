"""The Dockerfile's default scanner version is the package's version.

The release workflows pass ``SCANNER_VERSION`` as a build arg, but the
registry's scan image is built without one (``make deploy-scanner``), so it
installs whatever the ``ARG`` default names. A default left behind after a
version bump ships the previous scanner to every scan.
"""

import re
import tomllib
from pathlib import Path

SCANNER_DIR = Path(__file__).resolve().parent.parent


def test_dockerfile_default_matches_package_version() -> None:
    project = tomllib.loads((SCANNER_DIR / "pyproject.toml").read_text())
    dockerfile = (SCANNER_DIR / "Dockerfile").read_text()

    match = re.search(r"^ARG SCANNER_VERSION=(\S+)$", dockerfile, re.MULTILINE)

    assert match, "Dockerfile declares no default for ARG SCANNER_VERSION"
    assert match.group(1) == project["project"]["version"]
