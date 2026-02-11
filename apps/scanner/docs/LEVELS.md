# MTF Compliance Levels

The mpak Trust Framework (MTF) defines four compliance levels. Each level builds on the previous, adding more rigorous security requirements.

## Quick Reference

| Level | Name     | Controls | Target Use Case                               | Effort   |
| ----- | -------- | -------- | --------------------------------------------- | -------- |
| L1    | Basic    | 5        | Personal projects, experimentation            | Minutes  |
| L2    | Standard | 15       | Team tools, published packages                | < 1 hour |
| L3    | Verified | 22       | Production, enterprise deployment             | Days     |
| L4    | Attested | 25       | Critical infrastructure, regulated industries | Weeks    |

## Level 1: Basic

**Target:** Personal projects, experimentation, internal tools

Level 1 ensures bundles are free from obvious security issues. This is the minimum bar for any distributed bundle.

### Required Controls (5)

| Control | Description              |
| ------- | ------------------------ |
| SC-01   | SBOM Generation          |
| CQ-01   | Secret Scanning          |
| CQ-02   | Malware Pattern Detection|
| AI-01   | Valid Manifest           |
| CD-01   | Tool Declaration         |

### How to Achieve

```bash
# 1. Generate SBOM
syft dir:./bundle -o cyclonedx-json > sbom.json

# 2. Scan for secrets
trufflehog filesystem ./bundle --only-verified

# 3. Scan for malicious patterns
guarddog pypi scan ./bundle

# 4. Validate manifest
npx ajv validate -s manifest.schema.json -d manifest.json

# 5. Ensure tools are declared in manifest
```

### Badge

![Level 1: Basic](https://img.shields.io/badge/MTF-L1%20Basic-gray)

---

## Level 2: Standard

**Target:** Team tools, published packages, community projects

Level 2 adds supply chain security, static analysis, and requires author identification. This is the recommended level for any publicly published bundle.

### Additional Controls (+10 from L1)

| Control | Description                        |
| ------- | ---------------------------------- |
| SC-02   | Vulnerability Scan (with EPSS/KEV) |
| SC-03   | Dependency Pinning                 |
| CQ-03   | Static Analysis Clean              |
| CQ-06   | Name Squatting Prevention          |
| AI-02   | Content Hashes                     |
| AI-05   | Bundle Completeness                |
| PR-01   | Source Repository                  |
| PR-02   | Author Identity                    |
| CD-02   | Permission Correlation             |
| CD-03   | Tool Description Safety            |

### How to Achieve

```bash
# All L1 requirements plus:

# 1. Scan for CVEs with EPSS/KEV enrichment
grype dir:./bundle -o json > vulns.json

# 2. Ensure lock file exists and all versions pinned
# Python: uv.lock, Node: package-lock.json

# 3. Run static analysis
bandit -r ./src -f json  # Python
npx eslint --plugin security ./src  # JavaScript

# 4. Add file hashes to manifest

# 5. Publish from verified GitHub account (OIDC)

# 6. Add repository URL to manifest

# 7. Declare permissions in manifest

# 8. Review tool descriptions for injection patterns
```

### Badge

![Level 2: Standard](https://img.shields.io/badge/MTF-L2%20Standard-blue)

---

## Level 3: Verified

**Target:** Production deployments, enterprise use

Level 3 requires cryptographic proof of bundle integrity and build provenance. Bundles at this level can be verified end-to-end from source to distribution.

### Additional Controls (+7 from L2)

| Control | Description                  |
| ------- | ---------------------------- |
| SC-05   | Trusted Sources              |
| CQ-04   | Input Validation             |
| CQ-05   | Safe Execution Patterns      |
| AI-03   | Bundle Signature             |
| PR-03   | Build Attestation            |
| PR-05   | Source Repository Health     |
| CD-04   | Credential Scope Declaration |
| CD-05   | Token Lifetime Declaration   |

### How to Achieve

```bash
# All L2 requirements plus:

# 1. Verify all dependencies from trusted registries

# 2. Implement input validation (Pydantic, Zod, etc.)

# 3. Remove unsafe execution patterns (eval, shell=True)

# 4. Sign bundle with Sigstore
cosign sign-blob --bundle bundle.mcpb.sig bundle.mcpb

# 5. Set up GitHub Actions with SLSA provenance
# Use slsa-framework/slsa-github-generator

# 6. Run OpenSSF Scorecard on source repo
scorecard --repo=github.com/org/repo

# 7. Declare OAuth scopes in manifest

# 8. Declare token lifetimes for credentials
```

### Badge

![Level 3: Verified](https://img.shields.io/badge/MTF-L3%20Verified-green)

---

## Level 4: Attested

**Target:** Critical infrastructure, regulated industries, high-security environments

Level 4 represents maximum assurance. Bundles undergo behavioral analysis and (optionally) reproducible builds.

### Additional Controls (+3 from L3)

| Control | Description                      |
| ------- | -------------------------------- |
| CQ-07   | Behavioral Analysis              |
| AI-04   | Reproducible Build (RECOMMENDED) |
| PR-04   | Commit Linkage                   |

### How to Achieve

```bash
# All L3 requirements plus:

# 1. Pass behavioral analysis in sandbox
mbss-sandbox --profile strict ./bundle.mcpb

# 2. Enable reproducible builds (RECOMMENDED)
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)
# Use deterministic build tooling

# 3. Link exact commit in manifest
# Include commit SHA, signed commits recommended
```

### Badge

![Level 4: Attested](https://img.shields.io/badge/MTF-L4%20Attested-gold)

---

## Control Matrix

| Control                        | L1  | L2  | L3  | L4  | Domain             |
| ------------------------------ | :-: | :-: | :-: | :-: | ------------------ |
| SC-01 SBOM Generation          |  x  |  x  |  x  |  x  | Supply Chain       |
| SC-02 Vulnerability Scan       |     |  x  |  x  |  x  | Supply Chain       |
| SC-03 Dependency Pinning       |     |  x  |  x  |  x  | Supply Chain       |
| SC-05 Trusted Sources          |     |     |  x  |  x  | Supply Chain       |
| CQ-01 Secret Scanning          |  x  |  x  |  x  |  x  | Code Quality       |
| CQ-02 Malware Pattern Detection|  x  |  x  |  x  |  x  | Code Quality       |
| CQ-03 Static Analysis Clean    |     |  x  |  x  |  x  | Code Quality       |
| CQ-04 Input Validation         |     |     |  x  |  x  | Code Quality       |
| CQ-05 Safe Execution Patterns  |     |     |  x  |  x  | Code Quality       |
| CQ-06 Name Squatting Prevention|     |  x  |  x  |  x  | Code Quality       |
| CQ-07 Behavioral Analysis      |     |     |     |  x  | Code Quality       |
| AI-01 Valid Manifest           |  x  |  x  |  x  |  x  | Artifact Integrity |
| AI-02 Content Hashes           |     |  x  |  x  |  x  | Artifact Integrity |
| AI-03 Bundle Signature         |     |     |  x  |  x  | Artifact Integrity |
| AI-04 Reproducible Build*      |     |     |     |  x  | Artifact Integrity |
| AI-05 Bundle Completeness      |     |  x  |  x  |  x  | Artifact Integrity |
| PR-01 Source Repository        |     |  x  |  x  |  x  | Provenance         |
| PR-02 Author Identity          |     |  x  |  x  |  x  | Provenance         |
| PR-03 Build Attestation        |     |     |  x  |  x  | Provenance         |
| PR-04 Commit Linkage*          |     |     |     |  x  | Provenance         |
| PR-05 Source Repo Health       |     |     |  x  |  x  | Provenance         |
| CD-01 Tool Declaration         |  x  |  x  |  x  |  x  | Capability         |
| CD-02 Permission Correlation   |     |  x  |  x  |  x  | Capability         |
| CD-03 Tool Description Safety  |     |  x  |  x  |  x  | Capability         |
| CD-04 Credential Scope         |     |     |  x  |  x  | Capability         |
| CD-05 Token Lifetime           |     |     |  x  |  x  | Capability         |

\* = RECOMMENDED, not strictly required

---

## Choosing a Level

| If you are...                    | Minimum Level |
| -------------------------------- | ------------- |
| Building a personal tool         | L1            |
| Publishing to a registry         | L2            |
| Deploying to production          | L3            |
| In a regulated industry          | L4            |
| Building critical infrastructure | L4            |

## Policy Recommendations

| Environment          | Minimum | Additional Checks   |
| -------------------- | ------- | ------------------- |
| Development          | L1      | None                |
| Staging              | L2      | Review CVE findings |
| Production           | L3      | Verify signature    |
| Compliance-sensitive | L4      | Full audit trail    |
