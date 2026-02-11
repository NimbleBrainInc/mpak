"""Base control class and registry."""

from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Any

from mpak_scanner.models import ControlResult, ControlStatus


class EnforcementContext(str, Enum):
    """Where the control is enforced per MTF spec."""

    SCANNER = "scanner"  # Enforced by bundle scanner
    REGISTRY = "registry"  # Enforced by registry at publish time
    CLIENT = "client"  # Enforced by client at install time
    SCANNER_REGISTRY = "scanner_registry"  # Both scanner and registry


class Control(ABC):
    """Base class for security controls."""

    # Control metadata - override in subclasses
    id: str = ""
    name: str = ""
    domain: str = ""
    description: str = ""

    # MTF spec metadata
    level: int = 1  # Minimum level where this control is required (1-4)
    mcp_specific: bool = False  # True if this is an MCP-specific control
    enforcement: EnforcementContext = EnforcementContext.SCANNER

    @abstractmethod
    def run(self, bundle_dir: Path, manifest: dict[str, Any]) -> ControlResult:
        """Run the control check.

        Args:
            bundle_dir: Path to extracted bundle directory
            manifest: Parsed manifest.json contents

        Returns:
            ControlResult with status and any findings
        """
        pass

    def skip(self, reason: str = "Not implemented") -> ControlResult:
        """Return a skip result for this control."""
        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.SKIP,
            error=reason,
        )

    def error(self, message: str) -> ControlResult:
        """Return an error result for this control."""
        return ControlResult(
            control_id=self.id,
            control_name=self.name,
            status=ControlStatus.ERROR,
            error=message,
        )


class ControlRegistry:
    """Registry of available controls."""

    _controls: dict[str, type[Control]] = {}

    @classmethod
    def register(cls, control_class: type[Control]) -> type[Control]:
        """Register a control class."""
        cls._controls[control_class.id] = control_class
        return control_class

    @classmethod
    def get(cls, control_id: str) -> type[Control] | None:
        """Get a control class by ID."""
        return cls._controls.get(control_id)

    @classmethod
    def get_all(cls) -> dict[str, type[Control]]:
        """Get all registered controls."""
        return cls._controls.copy()

    @classmethod
    def get_by_domain(cls, domain: str) -> dict[str, type[Control]]:
        """Get all controls in a domain."""
        return {cid: ctrl for cid, ctrl in cls._controls.items() if ctrl.domain == domain}
