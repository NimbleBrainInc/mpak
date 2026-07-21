/**
 * Scan Job manifest tests.
 *
 * buildScanJob is the single place the scanner's pod security posture is
 * defined. These assertions lock in the least-privilege intent (scoped
 * ServiceAccount, non-root, dropped capabilities) so a future refactor can't
 * silently weaken it.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({
  config: {
    scanner: {
      enabled: true,
      image: '533267450054.dkr.ecr.us-east-1.amazonaws.com/mpak-scanner',
      imageTag: 'latest',
      namespace: 'security-scanning',
      serviceAccountName: 'mpak-scanner',
      callbackUrl: 'http://mpak-api.apps.svc.cluster.local:3200/app/scan-results',
      secretName: 'mpak-scanner-secrets',
      s3ResultPrefix: 'scan-results/',
      ttlSeconds: 3600,
      activeDeadlineSeconds: 900,
    },
    storage: {
      s3: { bucket: 'mpak-cdn', region: 'us-east-1' },
    },
  },
}));

const { buildScanJob } = await import('../src/services/scanner.js');

const params = {
  scanId: '00000000-0000-0000-0000-000000000001',
  bundleS3Key: 'packages/@scope/name/1.0.0/bundle.mcpb',
  packageName: '@scope/name',
  version: '1.0.0',
};

describe('buildScanJob', () => {
  it('runs the pod under the configured ServiceAccount', () => {
    const podSpec = buildScanJob(params).spec?.template?.spec;
    expect(podSpec?.serviceAccountName).toBe('mpak-scanner');
  });

  it('pins the least-privilege pod security context', () => {
    const podSpec = buildScanJob(params).spec?.template?.spec;
    expect(podSpec?.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 1000,
      seccompProfile: { type: 'RuntimeDefault' },
    });
  });

  it('drops all capabilities and blocks privilege escalation on the container', () => {
    const container = buildScanJob(params).spec?.template?.spec?.containers?.[0];
    expect(container?.securityContext?.allowPrivilegeEscalation).toBe(false);
    expect(container?.securityContext?.capabilities?.drop).toEqual(['ALL']);
  });

  it('targets the bundle under scan with the scanner image', () => {
    const job = buildScanJob(params);
    expect(job.metadata?.name).toMatch(/^scan-/);
    const container = job.spec?.template?.spec?.containers?.[0];
    expect(container?.image).toBe(
      '533267450054.dkr.ecr.us-east-1.amazonaws.com/mpak-scanner:latest',
    );
    expect(container?.env).toContainEqual({ name: 'BUNDLE_S3_KEY', value: params.bundleS3Key });
  });
});
