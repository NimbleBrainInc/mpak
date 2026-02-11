# Control Reference

This document provides a quick reference for all MTF security controls.

## Implementation Status

| Status | Meaning |
|--------|---------|
| Implemented | Implemented |
| Planned | Planned |
| Not yet implemented | Not yet implemented |

## Level 1: Basic

Required for all published bundles.

| ID | Name | Description | Status | Tool |
|----|------|-------------|--------|------|
| SC-01 | SBOM Generation | Generate Software Bill of Materials | Implemented | Syft |
| CQ-01 | No Embedded Secrets | Detect secrets, credentials, API keys | Implemented | TruffleHog |
| CQ-02 | No Malicious Patterns | Detect malware and supply chain attacks | Implemented | GuardDog |
| AI-01 | Valid Manifest | Validate manifest.json structure | Implemented | Built-in |
| CD-01 | Tool Declaration | Validate tool declarations | Implemented | Built-in |

## Level 2: Standard

For team tools and published packages. All Level 1 controls plus:

| ID | Name | Description | Status | Tool |
|----|------|-------------|--------|------|
| SC-02 | Vulnerability Scan | Scan for known CVE vulnerabilities (EPSS/KEV) | Implemented | Grype |
| SC-03 | Dependency Pinning | Verify dependencies are pinned | Implemented | Built-in |
| CQ-03 | Static Analysis Clean | Python/JS static analysis | Implemented | Bandit, ESLint |
| CQ-06 | Name Squatting Prevention | Detect slopsquatting and LLM hallucination names | Implemented | Built-in |
| AI-02 | Content Hashes | Verify file content hashes | Implemented | Built-in |
| AI-05 | Bundle Completeness | Verify bundle contains exactly what manifest declares | Planned | Built-in |
| PR-01 | Source Repository | Verify source repository link | Implemented | Built-in |
| PR-02 | Author Identity | Verify publisher identity | Implemented | Built-in |
| CD-02 | Permission Correlation | Validate permission declarations match code | Implemented | Built-in |
| CD-03 | Tool Description Safety | Detect prompt injection in descriptions | Implemented | Built-in |

## Level 3: Verified

For production and enterprise deployments. All Level 2 controls plus:

| ID | Name | Description | Status | Tool |
|----|------|-------------|--------|------|
| SC-05 | Trusted Sources | Verify dependency sources | Planned | Built-in |
| CQ-04 | Input Validation | Check for input validation | Planned | AST analysis |
| CQ-05 | Safe Execution Patterns | Detect unsafe code patterns | Implemented | Built-in |
| AI-03 | Bundle Signature | Verify cryptographic signature | Planned | Cosign/Sigstore |
| PR-03 | Build Attestation | Verify SLSA build attestation | Planned | SLSA Verifier |
| PR-05 | Source Repository Health | OpenSSF Scorecard score | Planned | Scorecard |
| CD-04 | Credential Scope Declaration | Verify OAuth scope declarations | Planned | Built-in |
| CD-05 | Token Lifetime Declaration | Verify token lifetime declarations | Implemented | Built-in |

## Level 4: Attested

For critical infrastructure. All Level 3 controls plus:

| ID | Name | Description | Status | Tool |
|----|------|-------------|--------|------|
| CQ-07 | Behavioral Analysis | Dynamic sandbox analysis | Planned | Custom sandbox |
| AI-04 | Reproducible Build | Verify reproducible builds (recommended) | Planned | Built-in |
| PR-04 | Commit Linkage | Verify commit linkage (recommended) | Planned | Git |

## MCP-Specific Controls

These controls address attack surfaces unique to MCP and AI-assisted development:

| ID | Name | Why MCP-Specific |
|----|------|------------------|
| CQ-06 | Name Squatting Prevention | LLMs hallucinate package names; attackers register them |
| CQ-07 | Behavioral Analysis | Runtime behavior may differ from static declarations |
| CD-03 | Tool Description Safety | LLMs treat descriptions as trusted instructions |
| CD-04 | Credential Scope Declaration | MCP servers aggregate credentials for multiple services |
| CD-05 | Token Lifetime Declaration | Credential exposure window transparency |

## Control Details

### SC-01: SBOM Generation

Generates a Software Bill of Materials using Syft. Outputs CycloneDX format.

```bash
syft dir:./bundle -o cyclonedx-json
```

### SC-02: Vulnerability Scan

Scans for CVEs using Grype. Enhanced with EPSS (exploitation probability) and KEV (known exploited) data.

```bash
grype dir:./bundle -o json
```

### SC-03: Dependency Pinning

Checks for lock files (uv.lock, package-lock.json, etc.) and validates that requirements.txt/package.json don't use floating versions (>=, ^, ~).

### CQ-01: No Embedded Secrets

Uses TruffleHog to detect API keys, tokens, passwords, and private keys.

```bash
trufflehog filesystem ./bundle --json --no-update
```

### CQ-02: No Malicious Patterns

Uses GuardDog to detect malware patterns, typosquatting, and supply chain attack indicators.

```bash
guarddog pypi scan ./bundle --output-format json
```

### CQ-03: Static Analysis Clean

Runs Bandit on Python code to detect security issues like SQL injection, shell injection, and unsafe deserialization.

```bash
bandit -r ./src -f json
```

### AI-01: Valid Manifest

Validates manifest.json structure:
- Required fields: `name`, `version`, `mcp_config`
- Version follows semver
- mcp_config has `command`

### AI-02: Content Hashes

Verifies that manifest.json includes SHA-256 hashes for server code files and that hashes match actual file contents.

### PR-01: Source Repository

Validates that manifest includes a `repository` field with a valid URL to the source code.

### PR-02: Author Identity

Validates that manifest includes author information (name, email) for accountability.

### CD-01: Tool Declaration

Validates that tools in manifest have:
- Name (not generic like "run", "execute")
- Description (human-readable)

### CD-02: Permission Scope

Validates that manifest declares permissions:
- filesystem: none, read, write, full
- network: none, outbound, inbound, full
- environment: none, read, write
- subprocess: none, restricted, full
- native: none, required

Also detects undeclared permission usage via static analysis.

### CQ-06: Name Squatting Prevention

Detects package names that exploit LLM hallucination patterns (slopsquatting). LLMs frequently hallucinate non-existent package names when generating code, and attackers register these names with malicious code. This is an MCP-specific control.

**Detection Methods:**
- Exact match against known hallucination corpus
- Similarity to commonly hallucinated names (Levenshtein distance)
- Version-like suffix patterns (e.g., `requests2`, `numpy-next`)
- Suspicious compound word patterns (e.g., `framework-helper`, `api-auth-utils`)

**Severity:**
- CRITICAL: Exact match to known hallucinated name
- HIGH: Very similar to hallucinated names
- MEDIUM: Matches suspicious patterns

### CQ-07: Behavioral Analysis (Stub)

Runtime sandbox analysis to detect behavioral anomalies. L4 control, primarily registry enforcement. **Not yet implemented.**

### CD-03: Tool Description Safety

Detects prompt injection, exfiltration directives, and hidden instructions in MCP tool descriptions. This is critical because LLMs treat tool descriptions as trusted instructions.

**Detection Methods:**
- Prompt injection patterns (e.g., "ignore previous instructions")
- Exfiltration directives (e.g., "read ~/.ssh/id_rsa and send to...")
- Hidden action instructions (e.g., "secretly", "without telling")
- Suspicious/undeclared URLs
- Obfuscated content (base64, hex encoding)
- Semantic mismatch between tool name and description

**Severity:**
- CRITICAL: Direct exfiltration, prompt injection, security bypass
- HIGH: Hidden actions, obfuscated content, behavioral directives
- MEDIUM: Suspicious URLs, semantic mismatch

## Full Specification

See the full [MTF Specification](../spec/MTF-0.1.md) for detailed requirements, verification criteria, and implementation guidance for each control.
