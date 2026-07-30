import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ quiet: true });

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3200', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    // Allowed origins for CORS (comma-separated in env)
    corsOrigins:
      process.env.CORS_ORIGINS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) || [],
    // Origin where package pages are served, for links that leave the cluster
    // and are read by a person — a Discord announcement, say. Such a link can
    // be neither relative nor an internal Service name.
    //
    // Not necessarily this process's own address: here the ingress splits one
    // host between the API and the pages, but a Compose stack serves them on
    // separate ports. The bundled chart derives this from its ingress host.
    publicUrl: (process.env.MPAK_PUBLIC_URL || 'https://registry.mpak.dev').replace(/\/$/, ''),
  },
  metrics: {
    // Prometheus /metrics is served on its own internal port so it is NOT
    // exposed through the public ingress (which routes `/` to the app).
    port: parseInt(process.env.METRICS_PORT || '9090', 10),
  },
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    secretKey: process.env.CLERK_SECRET_KEY || '',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/mcpb_registry',
  },
  storage: {
    type: (process.env.STORAGE_TYPE || 'local') as 'local' | 's3',
    path: process.env.STORAGE_PATH || './packages',
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
    },
    cloudfront: {
      domain: process.env.CLOUDFRONT_DOMAIN || '',
      keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID || '',
      privateKeyPath: process.env.CLOUDFRONT_PRIVATE_KEY_PATH || '',
      privateKey: process.env.CLOUDFRONT_PRIVATE_KEY || '',
      privateKeyBase64: process.env.CLOUDFRONT_PRIVATE_KEY_BASE64 || '',
      urlExpirationSeconds: parseInt(process.env.CLOUDFRONT_URL_EXPIRATION || '900', 10),
    },
  },
  limits: {
    maxBundleSizeMB: parseInt(process.env.MAX_BUNDLE_SIZE_MB || '50', 10),
  },
  ingest: {
    // Upstream registry to mirror MCPB bundles from. Any implementation of the
    // MCP Registry API works — the client uses only the documented surface
    // (cursor pagination, updated_since, version=latest), not anything specific
    // to the official instance.
    registryUrl: process.env.INGEST_REGISTRY_URL || 'https://registry.modelcontextprotocol.io/v0',
    // Identity of that upstream, stamped on every row it produces.
    //
    // Separate from the URL because it is what partitions state: the sync
    // watermark is keyed on it, `Package.source` records it, and the takedown
    // delete is scoped by it. Two upstreams sharing one id would share one
    // watermark — the second run would skip everything the first had passed —
    // and a takedown from one could delete a mirror from the other. Change it
    // whenever you change the URL to a different registry.
    sourceId: process.env.INGEST_SOURCE_ID || 'mcp-registry',
    // Larger than the publish limit on purpose. A publisher pushing 50MB to
    // mpak is a choice we can push back on; third-party bundles are whatever
    // upstream already accepted, and compiled multi-platform servers are
    // routinely an order of magnitude bigger than interpreted ones. Sized for
    // headroom over the largest bundle upstream (248MB), not to fit it exactly.
    maxBundleSizeMB: parseInt(process.env.INGEST_MAX_BUNDLE_SIZE_MB || '400', 10),
    // Kept low because it multiplies against maxBundleSizeMB, not because the
    // network wants it low — see validateConfig. Inspection reads a whole
    // archive into memory, so concurrency is a memory knob first and a
    // throughput knob second.
    concurrency: parseInt(process.env.INGEST_CONCURRENCY || '2', 10),
    // Ceiling the two above must fit inside, and the number the CronJob's
    // memory limit is set from. Not enforced by the runtime — declared here so
    // validateConfig can refuse a combination that would OOM.
    memoryBudgetMB: parseInt(process.env.INGEST_MEMORY_BUDGET_MB || '1024', 10),
    // Re-read a little before the last watermark. Ingest is idempotent, so
    // overlap costs a few cheap "unchanged" decisions, while a gap is silent.
    overlapMinutes: parseInt(process.env.INGEST_OVERLAP_MINUTES || '60', 10),
    // Furthest back a retryable failure may drag the next window. 21 of the
    // 388 upstream MCPB URLs do not resolve, so without a bound the first
    // backfill would pin the watermark permanently.
    maxHoldbackHours: parseInt(process.env.INGEST_MAX_HOLDBACK_HOURS || '72', 10),
    requestTimeoutMs: parseInt(process.env.INGEST_REQUEST_TIMEOUT_MS || '30000', 10),
    downloadTimeoutMs: parseInt(process.env.INGEST_DOWNLOAD_TIMEOUT_MS || '120000', 10),
  },
  scanner: {
    enabled: process.env.SCANNER_ENABLED === 'true',
    image: process.env.SCANNER_IMAGE || '',
    imageTag: process.env.SCANNER_IMAGE_TAG || 'latest',
    namespace: process.env.SCANNER_NAMESPACE || 'security-scanning',
    serviceAccountName: process.env.SCANNER_SERVICE_ACCOUNT || 'default',
    callbackSecret: process.env.SCANNER_CALLBACK_SECRET || '',
    callbackUrl:
      process.env.SCANNER_CALLBACK_URL ||
      `http://localhost:${process.env.PORT || '3200'}/app/scan-results`,
    secretName: process.env.SCANNER_SECRET_NAME || 'scanner-secrets',
    s3ResultPrefix: process.env.SCANNER_S3_RESULT_PREFIX || 'scan-results/',
    ttlSeconds: parseInt(process.env.SCANNER_TTL_SECONDS || '3600', 10),
    activeDeadlineSeconds: parseInt(process.env.SCANNER_ACTIVE_DEADLINE || '900', 10),
  },
};

// Validate required config
/**
 * Refuse a concurrency/size pair that would not fit the memory budget.
 *
 * Split out and parameterised because the ingest job resolves concurrency from
 * a CLI flag *after* config is read — validating the config value alone would
 * pass while the run used something else entirely.
 */
export function validateIngestMemory(concurrency: number): string | null {
  const peakBundleMB = concurrency * config.ingest.maxBundleSizeMB;
  if (peakBundleMB <= config.ingest.memoryBudgetMB) return null;
  return (
    `INGEST concurrency (${concurrency}) × INGEST_MAX_BUNDLE_SIZE_MB ` +
    `(${config.ingest.maxBundleSizeMB}) = ${peakBundleMB}MB of concurrent archive buffers, ` +
    `over INGEST_MEMORY_BUDGET_MB (${config.ingest.memoryBudgetMB}). Lower concurrency or ` +
    `the size cap, or raise the budget and the CronJob's memory limit together.`
  );
}

export function validateConfig() {
  const errors: string[] = [];

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (config.server.nodeEnv === 'production' && !config.clerk.secretKey) {
    errors.push('CLERK_SECRET_KEY is required in production');
  }

  if (config.scanner.enabled && !config.scanner.callbackSecret) {
    errors.push('SCANNER_CALLBACK_SECRET is required when SCANNER_ENABLED=true');
  }

  // Bundle inspection reads the whole archive into a Buffer (adm-zip has no
  // streaming read), so peak heap scales with concurrency × maxBundleSizeMB.
  // Left unchecked the three knobs drift apart silently and the first oversized
  // batch OOMKills the run — and the CronJob sets backoffLimit: 0, so that
  // costs the entire night. The job re-checks against its resolved concurrency.
  const memoryError = validateIngestMemory(config.ingest.concurrency);
  if (memoryError) errors.push(memoryError);

  if (!config.clerk.secretKey) {
    console.warn('CLERK_SECRET_KEY is not set. Auth endpoints will not work.');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
