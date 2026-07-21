/**
 * Security Scanner Service
 *
 * Creates K8s Jobs in the security-scanning namespace to scan bundles
 * for vulnerabilities, malicious code, and secrets.
 */

import { randomUUID } from 'node:crypto';
import * as k8s from '@kubernetes/client-node';
import type { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

export interface TriggerScanParams {
  scanId: string;
  bundleS3Key: string;
  packageName: string;
  version: string;
}

export interface TriggerScanResult {
  jobName: string;
}

/**
 * Get K8s BatchV1Api client
 */
function getK8sClient(): k8s.BatchV1Api {
  const kc = new k8s.KubeConfig();

  try {
    kc.loadFromCluster();
  } catch {
    kc.loadFromDefault();
  }

  return kc.makeApiClient(k8s.BatchV1Api);
}

/**
 * Generate a short ID for Job naming
 */
function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 12);
}

/**
 * Build the K8s Job manifest for a bundle scan.
 *
 * Pure (no cluster calls) so the pod's security posture — the scoped
 * ServiceAccount, non-root user, dropped capabilities, and read-only reach —
 * can be asserted directly in tests and can't be silently dropped by a refactor.
 */
export function buildScanJob(params: TriggerScanParams): k8s.V1Job {
  const { scanId, bundleS3Key, packageName } = params;
  const jobName = `scan-${shortId(scanId)}`;

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace: config.scanner.namespace,
      labels: {
        app: 'mpak-scanner',
        'scan-id': scanId,
        'package-name': packageName.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, ''),
      },
    },
    spec: {
      ttlSecondsAfterFinished: config.scanner.ttlSeconds,
      activeDeadlineSeconds: config.scanner.activeDeadlineSeconds,
      backoffLimit: 1,
      template: {
        metadata: {
          labels: {
            app: 'mpak-scanner',
            'scan-id': scanId,
          },
        },
        spec: {
          restartPolicy: 'Never',
          // ServiceAccount the scan pod runs as. Point SCANNER_SERVICE_ACCOUNT
          // at one carrying cloud identity (e.g. IRSA / workload identity) scoped
          // to reading the bundle under scan and writing its report; defaults to
          // the namespace default SA.
          serviceAccountName: config.scanner.serviceAccountName,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1000,
            seccompProfile: {
              type: 'RuntimeDefault',
            },
          },
          containers: [
            {
              name: 'scanner',
              image: `${config.scanner.image}:${config.scanner.imageTag}`,
              imagePullPolicy: 'Always',
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: {
                  drop: ['ALL'],
                },
              },
              env: [
                { name: 'BUNDLE_S3_BUCKET', value: config.storage.s3.bucket },
                { name: 'BUNDLE_S3_KEY', value: bundleS3Key },
                { name: 'SCAN_ID', value: scanId },
                { name: 'CALLBACK_URL', value: config.scanner.callbackUrl },
                { name: 'RESULT_S3_BUCKET', value: config.storage.s3.bucket },
                { name: 'RESULT_S3_PREFIX', value: config.scanner.s3ResultPrefix },
                { name: 'AWS_REGION', value: config.storage.s3.region },
              ],
              envFrom: [
                {
                  secretRef: {
                    name: config.scanner.secretName,
                  },
                },
              ],
              resources: {
                requests: {
                  cpu: '500m',
                  memory: '2Gi',
                },
                limits: {
                  cpu: '2',
                  memory: '4Gi',
                },
              },
              volumeMounts: [
                {
                  name: 'scan-workspace',
                  mountPath: '/tmp/scan',
                },
              ],
            },
          ],
          volumes: [
            {
              name: 'scan-workspace',
              emptyDir: {},
            },
          ],
        },
      },
    },
  };
}

/**
 * Trigger a security scan for a bundle
 */
export async function triggerScan(params: TriggerScanParams): Promise<TriggerScanResult> {
  const { scanId, packageName, version } = params;

  if (!config.scanner.enabled) {
    console.log(`[scanner] Scanning disabled, skipping scan for ${packageName}@${version}`);
    return { jobName: 'disabled' };
  }

  const jobName = `scan-${shortId(scanId)}`;
  const job = buildScanJob(params);

  const client = getK8sClient();
  await client.createNamespacedJob({ namespace: config.scanner.namespace, body: job });

  console.log(`[scanner] Created scan Job ${jobName} for ${packageName}@${version}`);

  return { jobName };
}

/**
 * Helper to create a SecurityScan record and trigger the scan
 */
export async function triggerSecurityScan(
  prisma: PrismaClient,
  params: {
    versionId: string;
    bundleStoragePath: string;
    packageName: string;
    version: string;
  },
): Promise<void> {
  const { versionId, bundleStoragePath, packageName, version } = params;

  const scanId = randomUUID();

  await prisma.securityScan.create({
    data: {
      versionId,
      scanId,
      status: 'pending',
    },
  });

  const result = await triggerScan({
    scanId,
    bundleS3Key: `packages/${bundleStoragePath}`,
    packageName,
    version,
  });

  if (result.jobName !== 'disabled') {
    await prisma.securityScan.update({
      where: { scanId },
      data: {
        status: 'scanning',
        jobName: result.jobName,
      },
    });
  }
}
