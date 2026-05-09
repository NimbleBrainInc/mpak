/**
 * Compose an upstream MCP `ServerDetail` from a bundle's stored
 * mcpb v0.4 manifest plus mpak-side registry data (downloads,
 * provenance, certification, artifacts).
 *
 * Pure projection — no I/O, no async work. Every output field has
 * exactly one source:
 *
 *   $schema       constant URL pointer to the upstream draft schema
 *   name          manifest._meta["dev.mpak/registry"].name override, else
 *                 mechanical default (`dev.mpak.<scope>/<name>`, with
 *                 curated org map applied first when applicable)
 *   title         manifest.display_name ?? manifest.name
 *   description   manifest.description (truncated to 100 chars; upstream cap)
 *   version       manifest.version (PackageVersion.version on the rare
 *                 occasion the two diverge)
 *   websiteUrl    manifest.homepage
 *   repository    manifest.repository
 *   icons[]       manifest.icons[] when set, else [{ src: manifest.icon }]
 *                 when icon is set, else omitted; non-http(s) icons dropped
 *   packages[]    one entry per platform artifact (registryType: "mpak",
 *                 identifier: manifest.name, version, transport: stdio,
 *                 environmentVariables derived from manifest.user_config),
 *                 plus fileSha256 from each artifact
 *   _meta         manifest._meta verbatim + dev.mpak/registry block
 *                 (npmName, downloads, published_at, provenance,
 *                 certification, artifacts[])
 *
 * Validates the result against the Zod `ServerDetailSchema` before
 * returning. The throw-variant fails loud with the issue list when the
 * projection produces an invalid record — operator-side bug, surfaces
 * in logs, never reaches consumers.
 */

import type { Artifact, Package as DbPackage, PackageVersion } from "@prisma/client";
import {
  resolveReverseDnsName,
  type ServerDetail,
  ServerDetailSchema,
  type ServerPackage,
} from "@nimblebrain/mpak-schemas";

const UPSTREAM_SCHEMA_URL =
  "https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/reference/server-json/draft/server.schema.json";

/**
 * Inputs to {@link composeServerDetail}. Carries everything mpak knows
 * about a single bundle version.
 */
export interface ComposerInput {
  /**
   * Package row. Only `name` and `latestVersion` are used by the
   * projection itself; the rest of the row is here so callers can
   * pass the live record without additional selection.
   */
  pkg: Pick<DbPackage, "name" | "latestVersion" | "totalDownloads"> & {
    githubRepo?: string | null;
  };
  /**
   * The version row. `manifest` is the canonical authoring surface;
   * `provenance`, `publishedAt`, `releaseTag`, etc. enrich the
   * dev.mpak/registry meta block.
   */
  version: Pick<
    PackageVersion,
    "version" | "manifest" | "publishedAt" | "publishMethod" | "provenance" | "downloadCount"
  >;
  /** Per-platform artifacts. Empty array is fine — packages[] is omitted. */
  artifacts: Pick<Artifact, "os" | "arch" | "digest" | "sizeBytes" | "sourceUrl" | "storagePath">[];
  /** Top certification record for this version, if any. */
  certification?: {
    level: number;
    levelName?: string | null;
    controlsPassed?: number | null;
    controlsFailed?: number | null;
    controlsTotal?: number | null;
  } | null;
}

/**
 * Project a bundle into the upstream `ServerDetail` shape and validate
 * the output against `ServerDetailSchema`.
 *
 * Returns the validated `ServerDetail` on success, or null if the
 * manifest is too malformed to project (missing required fields,
 * upstream schema-rejected). Callers handle null by logging the
 * rejection (operator-facing) — consumers never see a half-projected
 * record.
 */
export function composeServerDetail(input: ComposerInput): ServerDetail | null {
  const manifest = (input.version.manifest ?? {}) as Record<string, unknown>;

  const description = stringField(manifest, "description") ?? input.pkg.name;
  const truncatedDescription = truncate(description, 100);
  const version =
    stringField(manifest, "version") ?? input.version.version ?? input.pkg.latestVersion ?? "0.0.0";

  const manifestMeta = (manifest["_meta"] as Record<string, unknown> | undefined) ?? null;
  const reverseDnsName = resolveReverseDnsName(input.pkg.name, manifestMeta);

  const display = stringField(manifest, "display_name");
  const title = display && display.trim().length > 0 ? display.trim() : input.pkg.name;

  const detail: Record<string, unknown> = {
    $schema: UPSTREAM_SCHEMA_URL,
    name: reverseDnsName,
    title,
    description: truncatedDescription,
    version,
  };

  const homepage = stringField(manifest, "homepage");
  if (homepage && isHttpUrl(homepage)) {
    detail["websiteUrl"] = homepage;
  }

  const repository = projectRepository(manifest, input.pkg.githubRepo);
  if (repository) detail["repository"] = repository;

  const icons = projectIcons(manifest);
  if (icons.length > 0) detail["icons"] = icons;

  const packages = projectPackages(input, manifest);
  if (packages.length > 0) detail["packages"] = packages;

  detail["_meta"] = composeMeta(input, manifest, manifestMeta);

  const result = ServerDetailSchema.safeParse(detail);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * Same as {@link composeServerDetail} but throws (with the Zod issue
 * list) instead of returning null. Intended for ingest-time validation
 * where a malformed projection should fail loudly.
 */
export function composeServerDetailOrThrow(input: ComposerInput): ServerDetail {
  const manifest = (input.version.manifest ?? {}) as Record<string, unknown>;

  const description = stringField(manifest, "description") ?? input.pkg.name;
  const truncatedDescription = truncate(description, 100);
  const version =
    stringField(manifest, "version") ?? input.version.version ?? input.pkg.latestVersion ?? "0.0.0";

  const manifestMeta = (manifest["_meta"] as Record<string, unknown> | undefined) ?? null;
  const reverseDnsName = resolveReverseDnsName(input.pkg.name, manifestMeta);

  const display = stringField(manifest, "display_name");
  const title = display && display.trim().length > 0 ? display.trim() : input.pkg.name;

  const detail: Record<string, unknown> = {
    $schema: UPSTREAM_SCHEMA_URL,
    name: reverseDnsName,
    title,
    description: truncatedDescription,
    version,
  };

  const homepage = stringField(manifest, "homepage");
  if (homepage && isHttpUrl(homepage)) detail["websiteUrl"] = homepage;
  const repository = projectRepository(manifest, input.pkg.githubRepo);
  if (repository) detail["repository"] = repository;
  const icons = projectIcons(manifest);
  if (icons.length > 0) detail["icons"] = icons;
  const packages = projectPackages(input, manifest);
  if (packages.length > 0) detail["packages"] = packages;
  detail["_meta"] = composeMeta(input, manifest, manifestMeta);

  return ServerDetailSchema.parse(detail);
}

// ── building blocks ────────────────────────────────────────────────────

function projectRepository(
  manifest: Record<string, unknown>,
  fallbackGithubRepo: string | null | undefined,
): { url: string; source: string; id?: string; subfolder?: string } | null {
  const repo = manifest["repository"];
  if (repo && typeof repo === "object") {
    const url = stringField(repo as Record<string, unknown>, "url");
    if (url && isHttpUrl(url)) {
      return { url, source: "github" };
    }
  }
  // Fall back to the package's tracked GitHub repo when the manifest
  // omits it — keeps source-link visibility on legacy bundles whose
  // manifests pre-date the repository field.
  if (fallbackGithubRepo) {
    const url = `https://github.com/${fallbackGithubRepo}`;
    return { url, source: "github" };
  }
  return null;
}

function projectIcons(manifest: Record<string, unknown>): { src: string; sizes?: string[] }[] {
  const icons = manifest["icons"];
  if (Array.isArray(icons)) {
    return icons
      .map((i) => {
        if (!i || typeof i !== "object") return null;
        const src = stringField(i as Record<string, unknown>, "src");
        if (!src || !isHttpUrl(src)) return null;
        const out: { src: string; sizes?: string[] } = { src };
        const sizes = (i as Record<string, unknown>)["sizes"];
        if (Array.isArray(sizes) && sizes.every((s) => typeof s === "string")) {
          out.sizes = sizes as string[];
        }
        return out;
      })
      .filter((i): i is { src: string; sizes?: string[] } => i !== null);
  }
  // Single-icon legacy field.
  const single = stringField(manifest, "icon");
  if (single && isHttpUrl(single)) {
    return [{ src: single, sizes: ["any"] }];
  }
  return [];
}

function projectPackages(input: ComposerInput, manifest: Record<string, unknown>): ServerPackage[] {
  const envVars = projectEnvironmentVariables(manifest);
  // Per-platform artifact download URLs live in
  // `_meta.dev.mpak/registry.artifacts[]`, NOT in packages[].identifier
  // — `identifier` is the package-registry name (the npm-style scoped
  // name), not the artifact location. We emit one packages[] entry per
  // artifact carrying the file hash and a stdio transport marker;
  // consumers that care about platform selection read the meta block.
  if (input.artifacts.length === 0) {
    return [
      {
        registryType: "mpak",
        identifier: input.pkg.name,
        version: input.version.version,
        transport: { type: "stdio" },
        ...(envVars.length > 0 ? { environmentVariables: envVars } : {}),
      },
    ];
  }
  return input.artifacts.map((art) => ({
    registryType: "mpak",
    identifier: input.pkg.name,
    version: input.version.version,
    transport: { type: "stdio" } as const,
    fileSha256: art.digest.replace(/^sha256:/, ""),
    ...(envVars.length > 0 ? { environmentVariables: envVars } : {}),
  }));
}

/**
 * Project `manifest.user_config` into upstream KeyValueInput entries
 * for `packages[].environmentVariables[]`. The env-var `name` comes
 * from `manifest.server.mcp_config.env` mapping when present (the
 * manifest declares which user_config field maps to which env var);
 * falls back to the field's upper-snake-cased key.
 */
function projectEnvironmentVariables(
  manifest: Record<string, unknown>,
): { name: string; description?: string; isSecret?: boolean; isRequired?: boolean; default?: string }[] {
  const userConfig = manifest["user_config"];
  if (!userConfig || typeof userConfig !== "object") return [];
  const envMap = readEnvMap(manifest);
  const out: ReturnType<typeof projectEnvironmentVariables> = [];
  for (const [field, raw] of Object.entries(userConfig)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const envName = envMap[field] ?? field.toUpperCase();
    const entry: ReturnType<typeof projectEnvironmentVariables>[number] = { name: envName };
    const description = stringField(f, "description");
    if (description) entry.description = description;
    if (typeof f["sensitive"] === "boolean") entry.isSecret = f["sensitive"] as boolean;
    if (typeof f["required"] === "boolean") entry.isRequired = f["required"] as boolean;
    const def = f["default"];
    if (typeof def === "string") entry.default = def;
    else if (typeof def === "number" || typeof def === "boolean") entry.default = String(def);
    out.push(entry);
  }
  return out;
}

/**
 * Read the manifest's `server.mcp_config.env` map. Each value is a
 * placeholder string like `"${user_config.api_key}"`; we extract the
 * field name on the right side so we can map field → env var name.
 */
function readEnvMap(manifest: Record<string, unknown>): Record<string, string> {
  const server = manifest["server"];
  if (!server || typeof server !== "object") return {};
  const mcpConfig = (server as Record<string, unknown>)["mcp_config"];
  if (!mcpConfig || typeof mcpConfig !== "object") return {};
  const env = (mcpConfig as Record<string, unknown>)["env"];
  if (!env || typeof env !== "object") return {};
  const out: Record<string, string> = {};
  for (const [envName, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    const m = /\$\{?user_config\.([a-zA-Z0-9_]+)\}?/.exec(value);
    if (m?.[1]) {
      out[m[1]] = envName;
    }
  }
  return out;
}

/**
 * Compose the `_meta` field:
 *   - every author-provided `_meta` block carried verbatim
 *   - mpak adds its own `dev.mpak/registry` block with npmName,
 *     downloads, published_at, provenance, certification, artifacts[]
 */
function composeMeta(
  input: ComposerInput,
  _manifest: Record<string, unknown>,
  manifestMeta: Record<string, unknown> | null,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(manifestMeta ?? {}) };
  const mpakBlock: Record<string, unknown> = {
    npmName: input.pkg.name,
  };
  // Carry author overrides under `dev.mpak/registry` (e.g. their reverse-DNS
  // `name`) verbatim alongside our enrichment.
  const authorMpak = manifestMeta?.["dev.mpak/registry"];
  if (authorMpak && typeof authorMpak === "object") {
    Object.assign(mpakBlock, authorMpak);
    mpakBlock["npmName"] = input.pkg.name; // mpak source-of-truth wins
  }
  const downloads = Number(input.pkg.totalDownloads ?? input.version.downloadCount ?? 0);
  if (Number.isFinite(downloads)) mpakBlock["downloads"] = downloads;
  if (input.version.publishedAt) {
    mpakBlock["published_at"] = input.version.publishedAt.toISOString();
  }
  if (input.version.publishMethod) {
    mpakBlock["publishMethod"] = input.version.publishMethod;
  }
  if (input.version.provenance) {
    mpakBlock["provenance"] = input.version.provenance;
  }
  if (input.certification) {
    mpakBlock["certification"] = input.certification;
  }
  if (input.artifacts.length > 0) {
    mpakBlock["artifacts"] = input.artifacts.map((a) => ({
      platform: { os: a.os, arch: a.arch },
      url: a.sourceUrl,
      sha256: a.digest.replace(/^sha256:/, ""),
      size: Number(a.sizeBytes),
    }));
  }
  meta["dev.mpak/registry"] = mpakBlock;
  return meta;
}

// ── small helpers ──────────────────────────────────────────────────────

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
