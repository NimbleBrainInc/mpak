import type { z } from "zod";

import {
  AnnounceRequestSchema,
  BundleDetailSchema,
  BundleSchema,
  BundleSearchResponseSchema,
  DownloadInfoSchema,
  MCPBIndexSchema,
  PackageDetailSchema,
  PackageSchema,
  PackageSearchResponseSchema,
  VersionDetailSchema,
  VersionsResponseSchema,
} from "./api-responses.js";
import { UserProfileSchema } from "./auth.js";
import { MpakJsonSchema } from "./mpak-json.js";
import { PackageSearchParamsSchema } from "./package.js";
import {
  SkillAnnounceRequestSchema,
  SkillDetailSchema,
  SkillFrontmatterSchema,
  SkillSearchResponseSchema,
} from "./skill.js";

// =============================================================================
// Validation Result Type
// =============================================================================

/**
 * Result of a schema validation.
 * On success, `data` contains the parsed (and typed) value.
 * On failure, `errors` contains human-readable error messages.
 */
export type ValidationResult<T> =
  | { success: true; data: T; errors?: undefined }
  | { success: false; data?: undefined; errors: string[] };

// =============================================================================
// Generic Validator
// =============================================================================

/**
 * Validate unknown data against a Zod schema, returning a friendly result.
 */
function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });

  return { success: false, errors };
}

// =============================================================================
// Package & Bundle Validators
// =============================================================================

/** Validate data as a Package (list item). */
export function validatePackage(data: unknown) {
  return validate(PackageSchema, data);
}

/** Validate data as a PackageDetail (single-package endpoint). */
export function validatePackageDetail(data: unknown) {
  return validate(PackageDetailSchema, data);
}

/** Validate data as a PackageSearchResponse. */
export function validatePackageSearchResponse(data: unknown) {
  return validate(PackageSearchResponseSchema, data);
}

/** Validate search parameters. */
export function validatePackageSearchParams(data: unknown) {
  return validate(PackageSearchParamsSchema, data);
}

/** Validate data as a Bundle (v1 API). */
export function validateBundle(data: unknown) {
  return validate(BundleSchema, data);
}

/** Validate data as a BundleDetail (v1 API). */
export function validateBundleDetail(data: unknown) {
  return validate(BundleDetailSchema, data);
}

/** Validate data as a BundleSearchResponse (v1 API). */
export function validateBundleSearchResponse(data: unknown) {
  return validate(BundleSearchResponseSchema, data);
}

/** Validate data as a VersionsResponse (v1 API). */
export function validateVersionsResponse(data: unknown) {
  return validate(VersionsResponseSchema, data);
}

/** Validate data as a VersionDetail (v1 API). */
export function validateVersionDetail(data: unknown) {
  return validate(VersionDetailSchema, data);
}

/** Validate data as DownloadInfo (v1 API). */
export function validateDownloadInfo(data: unknown) {
  return validate(DownloadInfoSchema, data);
}

/** Validate data as an MCPBIndex. */
export function validateMCPBIndex(data: unknown) {
  return validate(MCPBIndexSchema, data);
}

/** Validate an announce request payload. */
export function validateAnnounceRequest(data: unknown) {
  return validate(AnnounceRequestSchema, data);
}

// =============================================================================
// Auth Validators
// =============================================================================

/** Validate data as a UserProfile. */
export function validateUserProfile(data: unknown) {
  return validate(UserProfileSchema, data);
}

// =============================================================================
// mpak.json Validators
// =============================================================================

/** Validate data as an mpak.json file. */
export function validateMpakJson(data: unknown) {
  return validate(MpakJsonSchema, data);
}

// =============================================================================
// Skill Validators
// =============================================================================

/** Validate SKILL.md frontmatter. */
export function validateSkillFrontmatter(data: unknown) {
  return validate(SkillFrontmatterSchema, data);
}

/** Validate a skill announce request. */
export function validateSkillAnnounceRequest(data: unknown) {
  return validate(SkillAnnounceRequestSchema, data);
}

/** Validate a skill search response. */
export function validateSkillSearchResponse(data: unknown) {
  return validate(SkillSearchResponseSchema, data);
}

/** Validate a skill detail response. */
export function validateSkillDetail(data: unknown) {
  return validate(SkillDetailSchema, data);
}
