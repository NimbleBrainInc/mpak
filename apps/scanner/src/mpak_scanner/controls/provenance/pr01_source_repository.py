"""PR-01: Source Repository control."""

import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Known repository hosting platforms
KNOWN_HOSTS = [
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "codeberg.org",
    "sr.ht",
    "gitea.com",
]

# Repository URL patterns
REPO_URL_PATTERN = re.compile(r"^https?://([\w.-]+)/([\w.-]+)/([\w.-]+)/?.*$")


@ControlRegistry.register
class PR01SourceRepository(Control):
    """PR-01: Source Repository.

    Requirement: The bundle MUST link to a publicly accessible source repository.
    """

    id = "PR-01"
    name = "Source Repository"
    domain = "provenance"
    description = "Verify source repository is declared and valid"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Check for repository field in manifest
        repository = manifest.get("repository")

        if not repository:
            # Missing repository is a compliance issue for L2+, not a security vulnerability
            findings.append(
                Finding(
                    id="PR-01-0001",
                    control=self.id,
                    severity=Severity.LOW,
                    title="No repository declared",
                    description="manifest.json does not include a 'repository' field (required for L2+)",
                    file="manifest.json",
                    remediation="Add 'repository' field with URL to source code",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        # Extract URL from repository field (can be string or object)
        repo_url: str | None = None
        if isinstance(repository, str):
            repo_url = repository
        elif isinstance(repository, dict):
            repo_url = repository.get("url")

        if not repo_url:
            findings.append(
                Finding(
                    id="PR-01-0001",
                    control=self.id,
                    severity=Severity.MEDIUM,
                    title="Invalid repository format",
                    description="Repository field exists but URL could not be extracted",
                    file="manifest.json",
                    remediation='Use format: {"repository": {"type": "git", "url": "https://..."}}',
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        # Normalize URL (remove .git suffix, trailing slashes)
        repo_url = repo_url.rstrip("/")
        if repo_url.endswith(".git"):
            repo_url = repo_url[:-4]

        # Validate URL format
        try:
            parsed = urlparse(repo_url)
            if not parsed.scheme or not parsed.netloc:
                raise ValueError("Invalid URL")
        except Exception:
            findings.append(
                Finding(
                    id="PR-01-0001",
                    control=self.id,
                    severity=Severity.MEDIUM,
                    title="Invalid repository URL",
                    description=f"Repository URL is not valid: {repo_url}",
                    file="manifest.json",
                    remediation="Use a valid HTTPS URL",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        # Check for HTTPS (recommended)
        if parsed.scheme != "https":
            findings.append(
                Finding(
                    id="PR-01-0002",
                    control=self.id,
                    severity=Severity.MEDIUM,
                    title="Repository URL not HTTPS",
                    description=f"Repository URL uses {parsed.scheme} instead of https",
                    file="manifest.json",
                    remediation="Use HTTPS URL for repository",
                )
            )

        # Check for known hosting platform
        host = parsed.netloc.lower()
        is_known_host = any(known in host for known in KNOWN_HOSTS)

        if is_known_host:
            findings.append(
                Finding(
                    id="PR-01-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title=f"Repository on {host}",
                    description=f"Source repository: {repo_url}",
                    metadata={"url": repo_url, "host": host},
                )
            )
        else:
            findings.append(
                Finding(
                    id="PR-01-0003",
                    control=self.id,
                    severity=Severity.LOW,
                    title="Repository on unknown host",
                    description=f"Repository host '{host}' is not a well-known platform",
                    file="manifest.json",
                    metadata={"url": repo_url, "host": host},
                )
            )

        duration = int((time.time() - start) * 1000)

        # Pass if we have a valid URL (warnings are OK)
        # Fail if repository is missing or invalid (MEDIUM severity issues)
        has_blocking = any(
            f.severity in (Severity.HIGH, Severity.MEDIUM) and "repository" in f.title.lower() for f in findings
        )

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.FAIL if has_blocking else ControlStatus.PASS,
            findings=findings,
            duration_ms=duration,
            raw_output={"repository_url": repo_url},
        )
