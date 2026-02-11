/**
 * Security Scanner Service
 *
 * Creates K8s Jobs in the security-scanning namespace to scan bundles
 * for vulnerabilities, malicious code, and secrets.
 */

import * as k8s from '@kubernetes/client-node';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import type { PrismaClient } from '@prisma/client';

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
 * Trigger a security scan for a bundle
 */
export async function triggerScan(params: TriggerScanParams): Promise<TriggerScanResult> {
  const { scanId, bundleS3Key, packageName, version } = params;

  if (!config.scanner.enabled) {
    console.log(`[scanner] Scanning disabled, skipping scan for ${packageName}@${version}`);
    return { jobName: 'disabled' };
  }

  const jobName = `scan-${shortId(scanId)}`;
  const namespace = config.scanner.namespace;

  const job: k8s.V1Job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace,
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

  const client = getK8sClient();
  await client.createNamespacedJob({ namespace, body: job });

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
  }
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
