import { z } from 'zod';

/**
 * Upstream MCP Registry `ServerDetail` shape — the canonical wire format
 * mpak emits for `/v0.1/servers/...` and `/v1/servers/...`.
 *
 * Composed mechanically from the bundle's `manifest.json` plus mpak-side
 * registry data (downloads, provenance, certification, artifacts). The
 * composer lives in `apps/registry/src/services/server-detail-composer.ts`.
 *
 * Validation is stricter than the upstream schema in places where mpak
 * has stronger guarantees (e.g. names always carry the reverse-DNS slash);
 * relaxed nowhere — anything that ajv-validates against the upstream draft
 * also passes here.
 *
 * Reference: https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/reference/server-json/draft/server.schema.json
 */

// =============================================================================
// Building blocks (Icon, Repository, Transports, Inputs, Package)
// =============================================================================

/** Sized icon descriptor. Upstream `Icon` type. */
export const IconSchema = z.object({
  src: z.string().url().max(255),
  mimeType: z
    .enum(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'])
    .optional(),
  sizes: z.array(z.string().regex(/^(\d+x\d+|any)$/)).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});
export type Icon = z.infer<typeof IconSchema>;

/** Repository pointer. Upstream `Repository` type. */
export const RepositorySchema = z.object({
  url: z.string().url(),
  source: z.string(),
  id: z.string().optional(),
  subfolder: z.string().optional(),
});
export type Repository = z.infer<typeof RepositorySchema>;

/** Stdio transport — the only `type` field is required at the wire. */
export const StdioTransportSchema = z.object({
  type: z.literal('stdio'),
});
export type StdioTransport = z.infer<typeof StdioTransportSchema>;

/** Free-form Input shared by env vars, args, and remote variables. */
export const InputSchema = z.object({
  description: z.string().optional(),
  default: z.string().optional(),
  format: z.enum(['string', 'number', 'boolean', 'filepath']).optional(),
  isRequired: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  choices: z.array(z.string()).optional(),
});
export type Input = z.infer<typeof InputSchema>;

/** KeyValueInput — Input that names an env var or HTTP header. */
export const KeyValueInputSchema = InputSchema.extend({
  name: z.string(),
  variables: z.record(z.string(), InputSchema).optional(),
});
export type KeyValueInput = z.infer<typeof KeyValueInputSchema>;

/** Streamable HTTP transport (preferred MCP-over-HTTP profile). */
export const StreamableHttpTransportSchema = z.object({
  type: z.literal('streamable-http'),
  url: z.string().regex(/^(https?:\/\/[^\s]+|\{[a-zA-Z_][a-zA-Z0-9_]*\}[^\s]*)$/),
  headers: z.array(KeyValueInputSchema).optional(),
});

/** Server-Sent Events transport (legacy MCP-over-SSE profile). */
export const SseTransportSchema = z.object({
  type: z.literal('sse'),
  url: z.string().regex(/^(https?:\/\/[^\s]+|\{[a-zA-Z_][a-zA-Z0-9_]*\}[^\s]*)$/),
  headers: z.array(KeyValueInputSchema).optional(),
});

/** Local transport — what packages[] declare. */
export const LocalTransportSchema = z.union([
  StdioTransportSchema,
  StreamableHttpTransportSchema,
  SseTransportSchema,
]);
export type LocalTransport = z.infer<typeof LocalTransportSchema>;

/** Remote transport — what remotes[] declare; can declare URL variables. */
export const RemoteTransportSchema = z.union([
  StreamableHttpTransportSchema.extend({
    variables: z.record(z.string(), InputSchema).optional(),
  }),
  SseTransportSchema.extend({
    variables: z.record(z.string(), InputSchema).optional(),
  }),
]);
export type RemoteTransport = z.infer<typeof RemoteTransportSchema>;

/**
 * Package distribution descriptor — what the server.json `packages[]`
 * array contains. Named `ServerPackageSchema` (rather than `Package`)
 * to avoid colliding with the bundle-registry `Package` type already
 * exported from `api-responses.ts`.
 */
export const ServerPackageSchema = z.object({
  registryType: z.string(),
  identifier: z.string(),
  transport: LocalTransportSchema,
  version: z.string().min(1).max(255).optional(),
  registryBaseUrl: z.string().url().optional(),
  fileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  runtimeHint: z.string().optional(),
  runtimeArguments: z.array(z.unknown()).optional(),
  packageArguments: z.array(z.unknown()).optional(),
  environmentVariables: z.array(KeyValueInputSchema).optional(),
});
export type ServerPackage = z.infer<typeof ServerPackageSchema>;

// =============================================================================
// ServerDetail
// =============================================================================

/** Reverse-DNS pattern for `name`. Upstream pattern, exactly. */
export const SERVER_NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

/**
 * Upstream `ServerDetail`. Required fields: name, description, version.
 * `_meta` accepts arbitrary reverse-DNS-namespaced extension keys.
 */
export const ServerDetailSchema = z.object({
  $schema: z.string().url().optional(),
  name: z.string().min(3).max(200).regex(SERVER_NAME_PATTERN),
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(100),
  version: z.string().min(1).max(255),
  websiteUrl: z.string().url().optional(),
  repository: RepositorySchema.optional(),
  icons: z.array(IconSchema).optional(),
  packages: z.array(ServerPackageSchema).optional(),
  remotes: z.array(RemoteTransportSchema).optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});
export type ServerDetail = z.infer<typeof ServerDetailSchema>;

/**
 * Wrapper for paginated `/v1/servers/search` responses. Mirrors the
 * `/v0.1/servers` shape so consumers can treat the two endpoints
 * interchangeably while the upstream MCP registry's search shape is
 * still being defined.
 */
export const ServerListResponseSchema = z.object({
  servers: z.array(ServerDetailSchema),
  metadata: z
    .object({
      count: z.number().int().nonnegative().optional(),
      next_cursor: z.string().optional(),
    })
    .optional(),
});
export type ServerListResponse = z.infer<typeof ServerListResponseSchema>;

// =============================================================================
// Helpers — reverse-DNS naming
// =============================================================================

/**
 * Mechanical reverse-DNS fallback for an npm-style scoped name:
 *   `@scope/name` → `dev.mpak.<lowercased-scope>/<lowercased-unscoped-name>`
 *   `plain`       → `dev.mpak/<lowercased-name>`
 *
 * Authors override via `manifest._meta["dev.mpak/registry"].name`. This
 * helper returns the mechanical default; the composer applies the
 * override when present.
 */
export function mechanicalReverseDnsName(npmName: string): string {
  const m = /^@([^/]+)\/(.+)$/.exec(npmName);
  if (!m) return `dev.mpak/${npmName.toLowerCase()}`;
  const scope = (m[1] ?? '').toLowerCase();
  const name = (m[2] ?? '').toLowerCase();
  return `dev.mpak.${scope}/${name}`;
}

/**
 * Org-scoped overrides for the mechanical default. Adding entries here
 * doesn't change behavior for already-published bundles unless their
 * record is reprojected.
 */
const ORG_REVERSE_DNS_MAP: Record<string, string> = {
  nimblebraininc: 'ai.nimblebrain',
};

/**
 * Apply the org→reverse-DNS map. When an org has a curated mapping the
 * bundle's reverse-DNS name uses that prefix; otherwise the mechanical
 * default applies.
 */
export function defaultReverseDnsName(npmName: string): string {
  const m = /^@([^/]+)\/(.+)$/.exec(npmName);
  if (!m) return mechanicalReverseDnsName(npmName);
  const scope = (m[1] ?? '').toLowerCase();
  const name = (m[2] ?? '').toLowerCase();
  const mapped = ORG_REVERSE_DNS_MAP[scope];
  if (mapped) return `${mapped}/${name}`;
  return mechanicalReverseDnsName(npmName);
}

/**
 * Resolve the reverse-DNS name for a bundle: author override (when the
 * manifest sets `_meta["dev.mpak/registry"].name`) wins over the
 * org-mapped default — but only when the override is one the publisher
 * is allowed to claim. Without authorization the override would let a
 * publisher of `@evil/spam` label themselves
 * `io.modelcontextprotocol/legitimate-tool` in registry listings.
 *
 * Authorization rules:
 *
 *   - The override's namespace must match the publisher's curated
 *     org-mapped reverse-DNS prefix (e.g. `@nimblebraininc/*` may
 *     override to anything starting with `ai.nimblebrain/`), OR
 *   - The override's namespace must start with `dev.mpak.<scope>`
 *     where `<scope>` is the publisher's npm scope (the mechanical
 *     namespace they already own implicitly).
 *
 * Anything else falls back to the mechanical default with no error —
 * the override is silently ignored. (Registry-side validation can
 * upgrade this to a publish-time rejection once we route author
 * overrides through OIDC-claim verification; this composer-side
 * gate prevents the squatted label from reaching consumer listings
 * in the meantime.)
 */
export function resolveReverseDnsName(
  npmName: string,
  manifestMeta: Record<string, unknown> | null | undefined,
): string {
  const meta = manifestMeta?.['dev.mpak/registry'];
  if (meta && typeof meta === 'object') {
    const override = (meta as { name?: unknown }).name;
    if (
      typeof override === 'string' &&
      SERVER_NAME_PATTERN.test(override) &&
      isOverrideAuthorized(npmName, override)
    ) {
      return override;
    }
  }
  return defaultReverseDnsName(npmName);
}

/**
 * Decide whether `override` is one the publisher of `npmName` is
 * allowed to claim. See {@link resolveReverseDnsName} for the rules.
 */
function isOverrideAuthorized(npmName: string, override: string): boolean {
  const m = /^@([^/]+)\//.exec(npmName);
  if (!m) {
    // Unscoped npm names can only override under `dev.mpak/`.
    return override.startsWith('dev.mpak/');
  }
  const scope = (m[1] ?? '').toLowerCase();
  const overrideNamespace = override.split('/')[0] ?? '';
  // Curated org-mapped namespace: must match exactly.
  const mapped = ORG_REVERSE_DNS_MAP[scope];
  if (mapped && overrideNamespace === mapped) return true;
  // Mechanical-default namespace: any publisher implicitly owns
  // `dev.mpak.<their-scope>`.
  if (overrideNamespace === `dev.mpak.${scope}`) return true;
  return false;
}
