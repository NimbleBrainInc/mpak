import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ quiet: true });

export const config = {
  server: {
    port: parseInt(process.env['PORT'] || '3200', 10),
    host: process.env['HOST'] || '0.0.0.0',
    nodeEnv: process.env['NODE_ENV'] || 'development',
    // Allowed origins for CORS (comma-separated in env)
    corsOrigins: process.env['CORS_ORIGINS']?.split(',').map(s => s.trim()).filter(Boolean) || [],
  },
  clerk: {
    publishableKey: process.env['CLERK_PUBLISHABLE_KEY'] || '',
    secretKey: process.env['CLERK_SECRET_KEY'] || '',
  },
  database: {
    url: process.env['DATABASE_URL'] || 'postgresql://localhost:5432/mcpb_registry',
  },
  storage: {
    type: (process.env['STORAGE_TYPE'] || 'local') as 'local' | 's3',
    path: process.env['STORAGE_PATH'] || './packages',
    s3: {
      bucket: process.env['S3_BUCKET'] || '',
      region: process.env['S3_REGION'] || 'us-east-1',
      accessKeyId: process.env['S3_ACCESS_KEY_ID'] || '',
      secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] || '',
    },
    cloudfront: {
      domain: process.env['CLOUDFRONT_DOMAIN'] || '',
      keyPairId: process.env['CLOUDFRONT_KEY_PAIR_ID'] || '',
      privateKeyPath: process.env['CLOUDFRONT_PRIVATE_KEY_PATH'] || '',
      privateKey: process.env['CLOUDFRONT_PRIVATE_KEY'] || '',
      privateKeyBase64: process.env['CLOUDFRONT_PRIVATE_KEY_BASE64'] || '',
      urlExpirationSeconds: parseInt(process.env['CLOUDFRONT_URL_EXPIRATION'] || '900', 10),
    },
  },
  limits: {
    maxBundleSizeMB: parseInt(process.env['MAX_BUNDLE_SIZE_MB'] || '50', 10),
  },
  scanner: {
    enabled: process.env['SCANNER_ENABLED'] === 'true',
    image: process.env['SCANNER_IMAGE'] || '',
    imageTag: process.env['SCANNER_IMAGE_TAG'] || 'latest',
    namespace: process.env['SCANNER_NAMESPACE'] || 'security-scanning',
    callbackSecret: process.env['SCANNER_CALLBACK_SECRET'] || '',
    callbackUrl: process.env['SCANNER_CALLBACK_URL'] || `http://localhost:${process.env['PORT'] || '3200'}/app/scan-results`,
    secretName: process.env['SCANNER_SECRET_NAME'] || 'scanner-secrets',
    s3ResultPrefix: process.env['SCANNER_S3_RESULT_PREFIX'] || 'scan-results/',
    ttlSeconds: parseInt(process.env['SCANNER_TTL_SECONDS'] || '3600', 10),
    activeDeadlineSeconds: parseInt(process.env['SCANNER_ACTIVE_DEADLINE'] || '900', 10),
  },
};

// Validate required config
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

  if (!config.clerk.secretKey) {
    console.warn('CLERK_SECRET_KEY is not set. Auth endpoints will not work.');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
