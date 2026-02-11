import { z } from 'zod';

// Author schema
export const PackageAuthorSchema = z.object({
  name: z.string(),
});

// Tool schema
export const PackageToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

// GitHub info schema
export const PackageGitHubSchema = z.object({
  repo: z.string(),
  stars: z.number().nullable(),
  forks: z.number().nullable(),
  watchers: z.number().nullable(),
  updated_at: z.string().nullable().optional(),
});

// Package list item schema (what comes back from search/list endpoints)
export const PackageSchema = z.object({
  name: z.string(), // Full name: 'react' or '@meta/react'
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  author: PackageAuthorSchema.nullable(),
  latest_version: z.string(),
  icon: z.string().nullable(),
  server_type: z.string(),
  tools: z.array(PackageToolSchema),
  downloads: z.number(),
  published_at: z.union([z.string(), z.date()]),
  verified: z.boolean(),
  claimable: z.boolean().optional(),
  claimed: z.boolean().optional(),
  github: PackageGitHubSchema.nullable().optional(),
  certification_level: z.number().nullable().optional(),
});

// Artifact schema (platform-specific bundles)
export const ArtifactSchema = z.object({
  os: z.string(), // darwin, win32, linux, any
  arch: z.string(), // x64, arm64, any
  size_bytes: z.number(),
  digest: z.string(), // sha256:xxxx format
  downloads: z.number(),
});

// Provenance schema (build/publish attestation)
export const ProvenanceSchema = z.object({
  publish_method: z.string().nullable(), // 'oidc' | 'upload' | 'cli'
  repository: z.string().nullable(), // GitHub repo (owner/repo)
  sha: z.string().nullable(), // Git commit SHA
});

// Certification schema (MTF compliance level)
export const CertificationSchema = z.object({
  level: z.number().nullable(), // 0=None, 1=Basic, 2=Standard, 3=Verified, 4=Attested
  level_name: z.string().nullable(), // Human-readable: "None", "Basic", "Standard", "Verified", "Attested"
  controls_passed: z.number().nullable(),
  controls_failed: z.number().nullable(),
  controls_total: z.number().nullable(),
});

// Scorecard finding schema (prioritized issue to fix)
export const ScorecardFindingSchema = z.object({
  id: z.string(),
  control: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  description: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  remediation: z.string().nullable(),
});

// Individual control within a security domain
export const DomainControlSchema = z.object({
  status: z.enum(['pass', 'fail', 'skip', 'error']),
  name: z.string(),
  findings_count: z.number(),
});

// Security domain (group of related controls)
export const SecurityDomainSchema = z.object({
  display_name: z.string(),
  controls_passed: z.number(),
  controls_total: z.number(),
  controls: z.record(z.string(), DomainControlSchema),
});

// Security scan summary schema (for UI display)
export const SecurityScanSchema = z.object({
  status: z.enum(['pending', 'scanning', 'completed', 'failed']),
  risk_score: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).nullable(),
  scanned_at: z.union([z.string(), z.date()]).nullable(),
  certification: CertificationSchema.nullable().optional(),
  summary: z.object({
    components: z.number(), // Total SBOM components
    vulnerabilities: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
    secrets: z.number(), // Detected secrets
    malicious: z.number(), // Malicious patterns
    code_issues: z.number(), // Static analysis issues
  }).optional(),
  domains: z.record(z.string(), SecurityDomainSchema).optional(),
  findings: z.array(ScorecardFindingSchema).optional(),
});

// Package version schema
export const PackageVersionSchema = z.object({
  version: z.string(),
  published_at: z.union([z.string(), z.date()]),
  downloads: z.number(),
  artifacts: z.array(ArtifactSchema).optional(),
  readme: z.string().nullable().optional(),
  provenance: ProvenanceSchema.nullable().optional(),
  release_url: z.string().nullable().optional(),
  prerelease: z.boolean().optional(),
  manifest: z.record(z.string(), z.unknown()).nullable().optional(),
  security_scan: SecurityScanSchema.nullable().optional(),
});

// Claiming info schema
export const PackageClaimingSchema = z.object({
  claimable: z.boolean(),
  claimed: z.boolean(),
  claimed_by: z.string().nullable(),
  claimed_at: z.union([z.string(), z.date()]).nullable(),
  github_repo: z.string().nullable(),
});

// Package detail schema (what comes back from package detail endpoint)
export const PackageDetailSchema = PackageSchema.extend({
  homepage: z.string().nullable(),
  license: z.string().nullable(),
  claiming: PackageClaimingSchema,
  versions: z.array(PackageVersionSchema),
});

// Package search response schema
export const PackageSearchResponseSchema = z.object({
  packages: z.array(PackageSchema),
  total: z.number(),
});

// =============================================================================
// V1 Bundle API Schemas
// =============================================================================

// Platform info schema (os + arch combo)
export const PlatformInfoSchema = z.object({
  os: z.string(), // darwin, win32, linux, any
  arch: z.string(), // x64, arm64, any
});

// Full provenance schema (returned by v1 API)
export const FullProvenanceSchema = z.object({
  schema_version: z.string(),
  provider: z.string(),
  repository: z.string(),
  sha: z.string(),
});

// Bundle schema (v1 API - similar to Package but with provenance)
export const BundleSchema = z.object({
  name: z.string(),
  display_name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  author: PackageAuthorSchema.nullable().optional(),
  latest_version: z.string(),
  icon: z.string().nullable().optional(),
  server_type: z.string().nullable().optional(),
  tools: z.array(PackageToolSchema).optional(),
  downloads: z.number(),
  published_at: z.union([z.string(), z.date()]),
  verified: z.boolean(),
  provenance: FullProvenanceSchema.nullable().optional(),
});

// Bundle detail schema (v1 API)
export const BundleDetailSchema = BundleSchema.extend({
  homepage: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  versions: z.array(z.object({
    version: z.string(),
    published_at: z.union([z.string(), z.date()]),
    downloads: z.number(),
  })),
});

// Bundle search response schema (v1 API)
export const BundleSearchResponseSchema = z.object({
  bundles: z.array(BundleSchema),
  total: z.number(),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean(),
  }),
});

// Version info with platforms (from /v1/bundles/@scope/pkg/versions)
export const VersionInfoSchema = z.object({
  version: z.string(),
  artifacts_count: z.number(),
  platforms: z.array(PlatformInfoSchema),
  published_at: z.union([z.string(), z.date()]),
  downloads: z.number(),
  publish_method: z.string().nullable(),
  provenance: FullProvenanceSchema.nullable().optional(),
});

// Versions response schema (v1 API)
export const VersionsResponseSchema = z.object({
  name: z.string(),
  latest: z.string(),
  versions: z.array(VersionInfoSchema),
});

// Download info schema (v1 API)
export const DownloadInfoSchema = z.object({
  url: z.string(),
  bundle: z.object({
    name: z.string(),
    version: z.string(),
    platform: PlatformInfoSchema,
    sha256: z.string(),
    size: z.number(),
  }),
  expires_at: z.string().optional(),
});

// =============================================================================
// Internal API Schemas (used by web UI, not exposed publicly)
// =============================================================================

// Pagination schema (reusable)
export const PaginationSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
});

// Publish response schema
export const PublishResponseSchema = z.object({
  success: z.boolean(),
  package: z.object({
    name: z.string(),
    version: z.string(),
    manifest: z.record(z.string(), z.unknown()),
  }),
  sha256: z.string(),
  size: z.number(),
  url: z.string(),
  auto_claimed: z.boolean().optional(),
  message: z.string().optional(),
});

// Internal download response schema (different from v1 API)
export const InternalDownloadResponseSchema = z.object({
  url: z.string(),
  package: z.object({
    name: z.string(),
    version: z.string(),
    sha256: z.string(),
    size: z.number(),
  }),
  expires_at: z.string(),
});

// Claim status response schema
export const ClaimStatusResponseSchema = z.object({
  claimable: z.boolean(),
  reason: z.string().optional(),
  claimed_by: z.string().nullable().optional(),
  claimed_at: z.union([z.string(), z.date()]).nullable().optional(),
  package_name: z.string().optional(),
  github_repo: z.string().nullable().optional(),
  instructions: z.object({
    steps: z.array(z.string()),
    mpak_json_example: z.string(),
    verification_url: z.string().nullable(),
  }).optional(),
});

// Claim response schema
export const ClaimResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  package: z.object({
    name: z.string(),
    claimed_by: z.string().nullable(),
    claimed_at: z.union([z.string(), z.date()]).nullable(),
    github_repo: z.string().nullable(),
  }),
  verification: z.object({
    mpak_json_url: z.string().nullable().optional(),
    verified_at: z.string(),
  }),
});

// My packages response schema
export const MyPackagesResponseSchema = z.object({
  packages: z.array(PackageSchema),
  total: z.number(),
  pagination: PaginationSchema,
});

// Unclaimed package schema
export const UnclaimedPackageSchema = z.object({
  name: z.string(),
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  server_type: z.string().nullable(),
  latest_version: z.string(),
  downloads: z.number(),
  github_repo: z.string().nullable(),
  created_at: z.union([z.string(), z.date()]),
});

// Unclaimed packages response schema
export const UnclaimedPackagesResponseSchema = z.object({
  packages: z.array(UnclaimedPackageSchema),
  total: z.number(),
  pagination: PaginationSchema,
});


// =============================================================================
// V1 API Additional Schemas
// =============================================================================

// Version detail response schema (specific version with artifacts)
export const VersionDetailSchema = z.object({
  name: z.string(),
  version: z.string(),
  published_at: z.union([z.string(), z.date()]),
  downloads: z.number(),
  artifacts: z.array(z.object({
    platform: PlatformInfoSchema,
    digest: z.string(),
    size: z.number(),
    download_url: z.string(),
    source_url: z.string().optional(),
  })),
  manifest: z.record(z.string(), z.unknown()),
  release: z.object({
    tag: z.string().nullable(),
    url: z.string().nullable(),
  }).optional(),
  publish_method: z.string().nullable(),
  provenance: FullProvenanceSchema.nullable(),
});

// MCPB Index response schema
export const MCPBIndexSchema = z.object({
  index_version: z.string(),
  mimeType: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().nullable(),
  bundles: z.array(z.object({
    mimeType: z.string().nullable(),
    digest: z.string(),
    size: z.number(),
    platform: PlatformInfoSchema,
    urls: z.array(z.string()),
  })),
  annotations: z.record(z.string(), z.string()).optional(),
});

// Announce request schema (per-artifact announcement from GitHub Actions)
export const AnnounceRequestSchema = z.object({
  name: z.string(),
  version: z.string(),
  manifest: z.record(z.string(), z.unknown()),
  release_tag: z.string(),
  prerelease: z.boolean().optional().default(false),
  artifact: z.object({
    filename: z.string(),
    os: z.string(),
    arch: z.string(),
    sha256: z.string(),
    size: z.number(),
  }),
});

// Announce response schema (per-artifact, idempotent)
export const AnnounceResponseSchema = z.object({
  package: z.string(),
  version: z.string(),
  artifact: z.object({
    os: z.string(),
    arch: z.string(),
    filename: z.string(),
  }),
  total_artifacts: z.number(),
  status: z.enum(['created', 'updated']),
});

// =============================================================================
// Export TypeScript types
// =============================================================================

// Core types
export type PackageAuthor = z.infer<typeof PackageAuthorSchema>;
export type PackageTool = z.infer<typeof PackageToolSchema>;
export type PackageGitHub = z.infer<typeof PackageGitHubSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type ScorecardFinding = z.infer<typeof ScorecardFindingSchema>;
export type DomainControl = z.infer<typeof DomainControlSchema>;
export type SecurityDomain = z.infer<typeof SecurityDomainSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type SecurityScan = z.infer<typeof SecurityScanSchema>;
export type PackageVersion = z.infer<typeof PackageVersionSchema>;
export type PackageClaiming = z.infer<typeof PackageClaimingSchema>;
export type PackageDetail = z.infer<typeof PackageDetailSchema>;
export type PackageSearchResponse = z.infer<typeof PackageSearchResponseSchema>;

// V1 API types
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;
export type FullProvenance = z.infer<typeof FullProvenanceSchema>;
export type Bundle = z.infer<typeof BundleSchema>;
export type BundleDetail = z.infer<typeof BundleDetailSchema>;
export type BundleSearchResponse = z.infer<typeof BundleSearchResponseSchema>;
export type VersionInfo = z.infer<typeof VersionInfoSchema>;
export type VersionsResponse = z.infer<typeof VersionsResponseSchema>;
export type DownloadInfo = z.infer<typeof DownloadInfoSchema>;
export type VersionDetail = z.infer<typeof VersionDetailSchema>;
export type MCPBIndex = z.infer<typeof MCPBIndexSchema>;
export type AnnounceRequest = z.infer<typeof AnnounceRequestSchema>;
export type AnnounceResponse = z.infer<typeof AnnounceResponseSchema>;

// Internal API types
export type Pagination = z.infer<typeof PaginationSchema>;
export type PublishResponse = z.infer<typeof PublishResponseSchema>;
export type InternalDownloadResponse = z.infer<typeof InternalDownloadResponseSchema>;
export type ClaimStatusResponse = z.infer<typeof ClaimStatusResponseSchema>;
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;
export type MyPackagesResponse = z.infer<typeof MyPackagesResponseSchema>;
export type UnclaimedPackage = z.infer<typeof UnclaimedPackageSchema>;
export type UnclaimedPackagesResponse = z.infer<typeof UnclaimedPackagesResponseSchema>;
