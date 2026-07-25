/**
 * Storage plugin boot contract.
 *
 * S3 credentials are resolved by the AWS SDK's default provider chain, not by
 * configuration this app reads. These assertions pin that boundary: bucket and
 * region are required because only the deployment knows them, and the absence
 * of a credential must NOT block boot -- a pod authenticating by instance or
 * container role has no credential to present here, and rejecting it would put
 * the app back to static keys as the only option.
 */

import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const s3Config = { bucket: '', region: '' };

vi.mock('../src/config.js', () => ({
  config: {
    storage: {
      get type() {
        return 's3';
      },
      path: './packages',
      get s3() {
        return s3Config;
      },
      cloudfront: { domain: '', keyPairId: '', privateKey: '', urlExpirationSeconds: 900 },
    },
  },
}));

const { storagePlugin } = await import('../src/plugins/storage.js');

async function register() {
  const app = Fastify();
  await app.register(storagePlugin);
  return app;
}

describe('storage plugin boot contract', () => {
  it('registers S3 storage without any credential configured', async () => {
    s3Config.bucket = 'mpak-cdn';
    s3Config.region = 'us-east-1';

    const app = await register();

    expect(app.storage).toBeDefined();
    await app.close();
  });

  it('rejects S3 storage with no bucket', async () => {
    s3Config.bucket = '';
    s3Config.region = 'us-east-1';

    await expect(register()).rejects.toThrow(/bucket and region/);
  });

  it('rejects S3 storage with no region', async () => {
    s3Config.bucket = 'mpak-cdn';
    s3Config.region = '';

    await expect(register()).rejects.toThrow(/bucket and region/);
  });
});
