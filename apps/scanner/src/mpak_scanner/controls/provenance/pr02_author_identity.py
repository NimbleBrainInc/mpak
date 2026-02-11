"""PR-02: Author Identity control."""

import re
import time
from pathlib import Path
from typing import Any

from mpak_scanner.controls.base import Control, ControlRegistry
from mpak_scanner.models import ControlResult, ControlStatus, Finding, Severity

# Email pattern for basic validation
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

# Organization email domains (non-free email providers suggest org affiliation)
FREE_EMAIL_DOMAINS = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "aol.com",
    "icloud.com",
    "protonmail.com",
    "proton.me",
    "mail.com",
    "yandex.com",
    "gmx.com",
]


@ControlRegistry.register
class PR02AuthorIdentity(Control):
    """PR-02: Author Identity.

    Requirement: The bundle publisher MUST have a verified identity.
    At scan time, we check that author information is declared.
    Full OIDC verification is performed by the registry at publish time.
    """

    id = "PR-02"
    name = "Author Identity"
    domain = "provenance"
    description = "Verify author identity is declared"
    level = 2

    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        start = time.time()
        findings: list[Finding] = []

        # Check for author fields in manifest
        # Support multiple formats: author, authors, maintainers, publisher
        author_info = self._extract_author_info(manifest)

        if not author_info:
            findings.append(
                Finding(
                    id="PR-02-0001",
                    control=self.id,
                    severity=Severity.HIGH,
                    title="No author identity declared",
                    description="manifest.json does not include author information",
                    file="manifest.json",
                    remediation="Add 'author' or 'authors' field with name and email",
                )
            )
            return ControlResult(
                control_id=self.id,
                control_name=self.name,
                status=ControlStatus.FAIL,
                findings=findings,
                duration_ms=int((time.time() - start) * 1000),
            )

        # Validate each author entry
        valid_authors: list[dict[str, str]] = []

        for i, author in enumerate(author_info):
            name = author.get("name", "")
            email = author.get("email", "")

            if not name and not email:
                findings.append(
                    Finding(
                        id=f"PR-02-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.MEDIUM,
                        title="Empty author entry",
                        description=f"Author entry {i + 1} has no name or email",
                        file="manifest.json",
                    )
                )
                continue

            # Validate email if present
            if email:
                if not EMAIL_PATTERN.match(email):
                    findings.append(
                        Finding(
                            id=f"PR-02-{len(findings) + 1:04d}",
                            control=self.id,
                            severity=Severity.MEDIUM,
                            title="Invalid email format",
                            description=f"Author email '{email}' is not valid",
                            file="manifest.json",
                        )
                    )
                else:
                    valid_authors.append(author)

                    # Note if using organizational email
                    domain = email.split("@")[-1].lower()
                    is_org_email = domain not in FREE_EMAIL_DOMAINS

                    if is_org_email:
                        findings.append(
                            Finding(
                                id=f"PR-02-{len(findings) + 1:04d}",
                                control=self.id,
                                severity=Severity.INFO,
                                title=f"Organizational email: {domain}",
                                description=f"Author {name or email} uses organizational email",
                                metadata={"domain": domain, "is_org": True},
                            )
                        )
            elif name:
                # Name only, no email
                valid_authors.append(author)
                findings.append(
                    Finding(
                        id=f"PR-02-{len(findings) + 1:04d}",
                        control=self.id,
                        severity=Severity.LOW,
                        title="Author without email",
                        description=f"Author '{name}' has no email for verification",
                        file="manifest.json",
                        remediation="Add email for author identity verification",
                    )
                )

        duration = int((time.time() - start) * 1000)

        # Pass if we have at least one valid author
        if valid_authors:
            findings.insert(
                0,
                Finding(
                    id="PR-02-0000",
                    control=self.id,
                    severity=Severity.INFO,
                    title=f"Found {len(valid_authors)} author(s)",
                    description=", ".join(a.get("name") or a.get("email", "Unknown") for a in valid_authors),
                ),
            )
            status = ControlStatus.PASS
        else:
            status = ControlStatus.FAIL

        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=status,
            findings=findings,
            duration_ms=duration,
            raw_output={"authors": valid_authors},
        )

    def _extract_author_info(self, manifest: dict[str, Any]) -> list[dict[str, str]]:
        """Extract author information from various manifest formats."""
        authors: list[dict[str, str]] = []

        # Check 'author' field (can be string or object)
        author = manifest.get("author")
        if author:
            if isinstance(author, str):
                # Parse "Name <email>" format
                parsed = self._parse_author_string(author)
                if parsed:
                    authors.append(parsed)
            elif isinstance(author, dict):
                authors.append(
                    {
                        "name": author.get("name", ""),
                        "email": author.get("email", ""),
                    }
                )

        # Check 'authors' array
        authors_list = manifest.get("authors", [])
        if isinstance(authors_list, list):
            for a in authors_list:
                if isinstance(a, str):
                    parsed = self._parse_author_string(a)
                    if parsed:
                        authors.append(parsed)
                elif isinstance(a, dict):
                    authors.append(
                        {
                            "name": a.get("name", ""),
                            "email": a.get("email", ""),
                        }
                    )

        # Check 'maintainers' array (npm style)
        maintainers = manifest.get("maintainers", [])
        if isinstance(maintainers, list):
            for m in maintainers:
                if isinstance(m, dict):
                    authors.append(
                        {
                            "name": m.get("name", ""),
                            "email": m.get("email", ""),
                        }
                    )

        # Check 'publisher' field
        publisher = manifest.get("publisher")
        if publisher:
            if isinstance(publisher, str):
                parsed = self._parse_author_string(publisher)
                if parsed:
                    authors.append(parsed)
            elif isinstance(publisher, dict):
                authors.append(
                    {
                        "name": publisher.get("name", ""),
                        "email": publisher.get("email", ""),
                    }
                )

        return authors

    def _parse_author_string(self, author_str: str) -> dict[str, str] | None:
        """Parse author string in 'Name <email>' format."""
        author_str = author_str.strip()
        if not author_str:
            return None

        # Try to extract email from "Name <email>" format
        match = re.match(r"^(.+?)\s*<([^>]+)>$", author_str)
        if match:
            return {
                "name": match.group(1).strip(),
                "email": match.group(2).strip(),
            }

        # Check if it's just an email
        if EMAIL_PATTERN.match(author_str):
            return {"name": "", "email": author_str}

        # Just a name
        return {"name": author_str, "email": ""}
