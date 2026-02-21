import { z } from 'zod';

export const PackageAuthorSchema = z.object({
  name: z.string(),
});

export const PackageToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const PackageGitHubSchema = z.object({
  repo: z.string(),
  stars: z.number().nullable(),
  forks: z.number().nullable(),
  watchers: z.number().nullable(),
  updated_at: z.string().nullable().optional(),
});

export const PackageSchema = z.object({
  name: z.string(),
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

export const ArtifactSchema = z.object({
  os: z.string(),
  arch: z.string(),
  size_bytes: z.number(),
  digest: z.string(),
  downloads: z.number(),
});

export const ProvenanceSchema = z.object({
  publish_method: z.string().nullable(),
  repository: z.string().nullable(),
  sha: z.string().nullable(),
});

export const CertificationSchema = z.object({
  level: z.number().nullable(),
  level_name: z.string().nullable(),
  controls_passed: z.number().nullable(),
  controls_failed: z.number().nullable(),
  controls_total: z.number().nullable(),
});

export const SecurityScanSchema = z.object({
  status: z.enum(['pending', 'scanning', 'completed', 'failed']),
  risk_score: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).nullable(),
  scanned_at: z.union([z.string(), z.date()]).nullable(),
  scanner_version: z.string().nullable().optional(),
  certification: CertificationSchema.nullable().optional(),
  summary: z.object({
    components: z.number(),
    vulnerabilities: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
    secrets: z.number(),
    malicious: z.number(),
    code_issues: z.number(),
  }).optional(),
});

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

export const PackageClaimingSchema = z.object({
  claimable: z.boolean(),
  claimed: z.boolean(),
  claimed_by: z.string().nullable(),
  claimed_at: z.union([z.string(), z.date()]).nullable(),
  github_repo: z.string().nullable(),
});

export const PackageDetailSchema = PackageSchema.extend({
  homepage: z.string().nullable(),
  license: z.string().nullable(),
  claiming: PackageClaimingSchema,
  versions: z.array(PackageVersionSchema),
});

export const PackageSearchResponseSchema = z.object({
  packages: z.array(PackageSchema),
  total: z.number(),
});

// V1 Bundle API Schemas

export const PlatformInfoSchema = z.object({
  os: z.string(),
  arch: z.string(),
});

export const FullProvenanceSchema = z.object({
  schema_version: z.string(),
  provider: z.string(),
  repository: z.string(),
  sha: z.string(),
});

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
  certification_level: z.number().nullable().optional(),
});

export const BundleDetailSchema = BundleSchema.extend({
  homepage: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  certification: CertificationSchema.nullable().optional(),
  versions: z.array(z.object({
    version: z.string(),
    published_at: z.union([z.string(), z.date()]),
    downloads: z.number(),
  })),
});

export const BundleSearchResponseSchema = z.object({
  bundles: z.array(BundleSchema),
  total: z.number(),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean(),
  }),
});

export const VersionInfoSchema = z.object({
  version: z.string(),
  artifacts_count: z.number(),
  platforms: z.array(PlatformInfoSchema),
  published_at: z.union([z.string(), z.date()]),
  downloads: z.number(),
  publish_method: z.string().nullable(),
  provenance: FullProvenanceSchema.nullable().optional(),
});

export const VersionsResponseSchema = z.object({
  name: z.string(),
  latest: z.string(),
  versions: z.array(VersionInfoSchema),
});

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

// Internal API Schemas

export const PaginationSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
});

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

export const MyPackagesResponseSchema = z.object({
  packages: z.array(PackageSchema),
  total: z.number(),
  pagination: PaginationSchema,
});

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

export const UnclaimedPackagesResponseSchema = z.object({
  packages: z.array(UnclaimedPackageSchema),
  total: z.number(),
  pagination: PaginationSchema,
});

// V1 API Additional Schemas

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

// TypeScript types
export type PackageAuthor = z.infer<typeof PackageAuthorSchema>;
export type PackageTool = z.infer<typeof PackageToolSchema>;
export type PackageGitHub = z.infer<typeof PackageGitHubSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type SecurityScan = z.infer<typeof SecurityScanSchema>;
export type PackageVersion = z.infer<typeof PackageVersionSchema>;
export type PackageClaiming = z.infer<typeof PackageClaimingSchema>;
export type PackageDetail = z.infer<typeof PackageDetailSchema>;
export type PackageSearchResponse = z.infer<typeof PackageSearchResponseSchema>;
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
export type Pagination = z.infer<typeof PaginationSchema>;
export type PublishResponse = z.infer<typeof PublishResponseSchema>;
export type InternalDownloadResponse = z.infer<typeof InternalDownloadResponseSchema>;
export type ClaimStatusResponse = z.infer<typeof ClaimStatusResponseSchema>;
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;
export type MyPackagesResponse = z.infer<typeof MyPackagesResponseSchema>;
export type UnclaimedPackage = z.infer<typeof UnclaimedPackageSchema>;
export type UnclaimedPackagesResponse = z.infer<typeof UnclaimedPackagesResponseSchema>;
