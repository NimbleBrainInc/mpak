"""Data models for mpak-scanner."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Severity(str, Enum):
    """Finding severity levels."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class RiskScore(str, Enum):
    """Overall risk score for a bundle."""

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NONE = "NONE"


class ComplianceLevel(int, Enum):
    """MTF compliance levels."""

    NONE = 0  # Does not meet L1
    L1_BASIC = 1  # Basic: personal projects
    L2_STANDARD = 2  # Standard: team tools, published packages
    L3_VERIFIED = 3  # Verified: production, enterprise
    L4_ATTESTED = 4  # Attested: critical infrastructure

    @property
    def name_str(self) -> str:
        """Human-readable level name."""
        names = {
            0: "None",
            1: "Basic",
            2: "Standard",
            3: "Verified",
            4: "Attested",
        }
        return names.get(self.value, "Unknown")


class ControlStatus(str, Enum):
    """Status of a control check."""

    PASS = "pass"
    FAIL = "fail"
    SKIP = "skip"  # Control not applicable or not run
    ERROR = "error"  # Control check errored


@dataclass
class Finding:
    """A single security finding."""

    id: str
    control: str
    severity: Severity
    title: str
    description: str
    file: str | None = None
    line: int | None = None
    remediation: str | None = None
    in_deps: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ControlResult:
    """Result of running a single control."""

    control_id: str
    control_name: str
    status: ControlStatus
    findings: list[Finding] = field(default_factory=list)
    error: str | None = None
    duration_ms: int = 0
    raw_output: dict[str, Any] | None = None

    @property
    def passed(self) -> bool:
        return self.status == ControlStatus.PASS


@dataclass
class DomainResult:
    """Results for a security domain."""

    domain: str
    controls: dict[str, ControlResult] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return all(c.passed for c in self.controls.values() if c.status != ControlStatus.SKIP)


# Control requirements per level
# True = required, False = not required at this level
# Updated to match MTF v0.1 spec (Appendix B)
CONTROL_LEVELS: dict[str, dict[int, bool]] = {
    # Artifact Integrity
    "AI-01": {1: True, 2: True, 3: True, 4: True},  # Manifest Validation (L1)
    "AI-02": {1: False, 2: False, 3: False, 4: False},  # Reserved - integrity via RG-07
    "AI-03": {1: False, 2: False, 3: True, 4: True},  # Bundle Signing (L3)
    "AI-04": {1: False, 2: False, 3: False, 4: True},  # Reproducible Builds (L4)
    "AI-05": {1: False, 2: True, 3: True, 4: True},  # Bundle Completeness (L2)
    # Supply Chain
    "SC-01": {1: True, 2: True, 3: True, 4: True},  # SBOM Generation (L1)
    "SC-02": {1: False, 2: True, 3: True, 4: True},  # Vulnerability Scanning (L2)
    "SC-03": {1: False, 2: True, 3: True, 4: True},  # Dependency Pinning (L2)
    "SC-04": {1: False, 2: True, 3: True, 4: True},  # Lockfile Integrity (L2)
    "SC-05": {1: False, 2: False, 3: True, 4: True},  # Trusted Sources (L3)
    # Code Quality
    "CQ-01": {1: True, 2: True, 3: True, 4: True},  # Secret Detection (L1)
    "CQ-02": {1: True, 2: True, 3: True, 4: True},  # Malware Patterns (L1)
    "CQ-03": {1: False, 2: True, 3: True, 4: True},  # Static Analysis (L2)
    "CQ-04": {1: False, 2: False, 3: True, 4: True},  # Input Validation (L3)
    "CQ-05": {1: False, 2: False, 3: True, 4: True},  # Safe Execution Patterns (L3)
    "CQ-06": {1: False, 2: False, 3: False, 4: True},  # Behavioral Analysis (L4, MCP-specific)
    # Capability Declaration
    "CD-01": {1: True, 2: True, 3: True, 4: True},  # Tool Declaration (L1)
    "CD-02": {1: False, 2: True, 3: True, 4: True},  # Permission Correlation (L2)
    "CD-03": {1: False, 2: True, 3: True, 4: True},  # Description Safety (L2, MCP-specific)
    "CD-04": {1: False, 2: False, 3: True, 4: True},  # Credential Scope Declaration (L3, MCP-specific)
    "CD-05": {1: False, 2: False, 3: True, 4: True},  # Token Lifetime Limits (L3, MCP-specific)
    # Provenance
    "PR-01": {1: False, 2: True, 3: True, 4: True},  # Source Repository (L2)
    "PR-02": {1: False, 2: True, 3: True, 4: True},  # Author Identity (L2)
    "PR-03": {1: False, 2: False, 3: True, 4: True},  # Build Attestation (L3)
    "PR-04": {1: False, 2: False, 3: False, 4: True},  # Commit Linkage (L4)
    "PR-05": {1: False, 2: False, 3: True, 4: True},  # Repository Health (L3)
}


def calculate_compliance_level(control_results: dict[str, ControlResult]) -> ComplianceLevel:
    """Calculate the highest compliance level achieved based on control results."""
    for level in [4, 3, 2, 1]:
        level_passed = True
        for control_id, level_requirements in CONTROL_LEVELS.items():
            if level_requirements.get(level, False):  # Control is required at this level
                result = control_results.get(control_id)
                if result is None or not result.passed:
                    level_passed = False
                    break
        if level_passed:
            return ComplianceLevel(level)
    return ComplianceLevel.NONE


@dataclass
class SecurityReport:
    """Complete security report for an MCP bundle."""

    bundle_name: str
    bundle_version: str
    bundle_hash: str
    scan_timestamp: str
    scanner_version: str
    duration_ms: int
    domains: dict[str, DomainResult] = field(default_factory=dict)
    sbom_component_count: int = 0
    sbom_format: str = "cyclonedx"

    @property
    def all_controls(self) -> dict[str, ControlResult]:
        """Flatten all control results from all domains."""
        controls: dict[str, ControlResult] = {}
        for domain in self.domains.values():
            controls.update(domain.controls)
        return controls

    @property
    def all_findings(self) -> list[Finding]:
        """Get all findings from all controls."""
        findings: list[Finding] = []
        for domain in self.domains.values():
            for control in domain.controls.values():
                findings.extend(control.findings)
        return findings

    @property
    def compliance_level(self) -> ComplianceLevel:
        """Calculate compliance level from control results."""
        return calculate_compliance_level(self.all_controls)

    @property
    def risk_score(self) -> RiskScore:
        """Calculate risk score from findings.

        Uses MCP-weighted priority system per MTF spec:

        Tier 1 (CRITICAL):
        - CD-03 fail: Tool description poisoning (LLM executes malicious instructions)
        - CQ-02 fail: Malicious patterns (active malware/backdoors)
        - CQ-01 fail with verified secrets: Immediate credential exposure
        - CQ-06 fail: Slopsquatting (AI hallucination attack vector)
        - SC-02 fail with KEV/critical CVE: Actively exploited or critical severity
        - CQ-07 fail: Behavioral mismatch (runtime contradicts declarations)

        Tier 2 (HIGH):
        - SC-02 high CVE with EPSS >10%: Likely to be exploited
        - CQ-03/CQ-05 high in server code: Code-level vulnerabilities
        - CD-04 fail: Excessive OAuth scopes (blast radius amplification)

        Tier 3 (MEDIUM):
        - SC-02 high CVE with EPSS <=10%: Severe but low probability
        - CD-03 warning: Suspicious but not blocking
        - Any medium severity findings
        """
        findings = self.all_findings

        # Tier 1: CRITICAL conditions
        for f in findings:
            # CD-03: Tool description poisoning = critical (MCP-specific)
            if f.control == "CD-03" and f.severity in (Severity.CRITICAL, Severity.HIGH):
                return RiskScore.CRITICAL
            # CQ-02: Malicious patterns = critical
            if f.control == "CQ-02" and f.severity == Severity.CRITICAL:
                return RiskScore.CRITICAL
            # CQ-01: Verified secrets = critical
            if f.control == "CQ-01" and f.metadata.get("verified"):
                return RiskScore.CRITICAL
            # CQ-06: Slopsquatting = critical (MCP-specific, AI hallucination attack)
            if f.control == "CQ-06" and f.severity in (Severity.CRITICAL, Severity.HIGH):
                return RiskScore.CRITICAL
            # SC-02: KEV or critical CVE = critical
            if f.control == "SC-02" and f.severity == Severity.CRITICAL:
                return RiskScore.CRITICAL
            if f.control == "SC-02" and f.metadata.get("in_kev"):
                return RiskScore.CRITICAL
            # CQ-07: Behavioral mismatch = critical (MCP-specific)
            if f.control == "CQ-07" and f.severity in (Severity.CRITICAL, Severity.HIGH):
                return RiskScore.CRITICAL

        # Tier 2: HIGH conditions
        # High severity in server code (not dependencies)
        server_high = [f for f in findings if f.severity == Severity.HIGH and not f.in_deps]
        if server_high:
            return RiskScore.HIGH

        # High severity CVEs that are blocking (EPSS >10% or no EPSS data)
        high_vulns = [
            f for f in findings if f.control == "SC-02" and f.severity == Severity.HIGH and f.metadata.get("blocking")
        ]
        if high_vulns:
            return RiskScore.HIGH

        # CD-04/CD-05: OAuth and token lifetime issues
        oauth_issues = [f for f in findings if f.control in ("CD-04", "CD-05") and f.severity == Severity.HIGH]
        if oauth_issues:
            return RiskScore.HIGH

        # Tier 3: MEDIUM conditions
        medium = [f for f in findings if f.severity == Severity.MEDIUM]
        if medium:
            return RiskScore.MEDIUM

        # Low or info only
        low_or_info = [f for f in findings if f.severity in (Severity.LOW, Severity.INFO)]
        if low_or_info:
            return RiskScore.LOW

        return RiskScore.NONE

    @property
    def controls_passed(self) -> int:
        """Count of controls that passed."""
        return sum(1 for c in self.all_controls.values() if c.passed)

    @property
    def controls_failed(self) -> int:
        """Count of controls that failed."""
        return sum(1 for c in self.all_controls.values() if c.status == ControlStatus.FAIL)

    @property
    def controls_total(self) -> int:
        """Total controls checked."""
        return sum(1 for c in self.all_controls.values() if c.status != ControlStatus.SKIP)

    def to_dict(self) -> dict[str, Any]:
        """Convert report to dictionary matching MTF report schema."""
        return {
            "version": "1.0.0",
            "bundle": {
                "name": self.bundle_name,
                "version": self.bundle_version,
                "hash": self.bundle_hash,
            },
            "scan": {
                "timestamp": self.scan_timestamp,
                "scanner": "mpak-scanner",
                "scanner_version": self.scanner_version,
                "duration_ms": self.duration_ms,
            },
            "compliance": {
                "level": self.compliance_level.value,
                "level_name": self.compliance_level.name_str,
                "controls_passed": self.controls_passed,
                "controls_failed": self.controls_failed,
                "controls_total": self.controls_total,
            },
            "risk_score": self.risk_score.value,
            "domains": {
                domain_name: {
                    "controls": {
                        ctrl_id: {
                            "status": ctrl.status.value,
                            "findings": [
                                {
                                    "id": f.id,
                                    "severity": f.severity.value,
                                    "title": f.title,
                                    "description": f.description,
                                    "file": f.file,
                                    "line": f.line,
                                    "remediation": f.remediation,
                                }
                                for f in ctrl.findings
                            ],
                            **({"error": ctrl.error} if ctrl.error else {}),
                        }
                        for ctrl_id, ctrl in domain.controls.items()
                    }
                }
                for domain_name, domain in self.domains.items()
            },
            "findings": [
                {
                    "id": f.id,
                    "control": f.control,
                    "severity": f.severity.value,
                    "title": f.title,
                    "description": f.description,
                    "file": f.file,
                    "line": f.line,
                    "remediation": f.remediation,
                }
                for f in self.all_findings
            ],
            "sbom": {
                "format": self.sbom_format,
                "component_count": self.sbom_component_count,
            },
        }
