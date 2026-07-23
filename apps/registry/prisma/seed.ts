/**
 * Seed script: inserts a handful of example MCPB bundles so the local UI has
 * something to show. Safe to run multiple times (uses upserts).
 *
 * Bundles enter the production registry through the GitHub Actions OIDC
 * announce flow; this seed only exists for local development.
 */

import { disconnectDatabase, getPrismaClient } from '../src/db/index.js';

const prisma = getPrismaClient();

interface SeedArtifact {
  os: string;
  arch: string;
  sizeBytes: number;
}

interface SeedVersion {
  version: string;
  downloads: number;
  releaseTag: string;
  artifacts: SeedArtifact[];
  // MTF certification (drives the trust badge in the UI)
  certificationLevel: number; // 1=Basic, 2=Standard, 3=Verified, 4=Attested
  controlsPassed: number;
  controlsTotal: number;
  riskScore: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface SeedBundle {
  name: string;
  description: string;
  serverType: string; // node | python | binary
  authorName: string;
  githubRepo: string;
  versions: SeedVersion[];
}

const BUNDLES: SeedBundle[] = [
  {
    name: '@nimblebraininc/ipinfo',
    description:
      'Look up geolocation, ASN, and privacy data for any IP address via the IPInfo API.',
    serverType: 'python',
    authorName: 'NimbleBrain',
    githubRepo: 'NimbleBrainInc/mcp-servers',
    versions: [
      {
        version: '0.2.0',
        downloads: 1840,
        releaseTag: 'ipinfo/v0.2.0',
        certificationLevel: 3,
        controlsPassed: 19,
        controlsTotal: 22,
        riskScore: 'LOW',
        artifacts: [{ os: 'any', arch: 'any', sizeBytes: 48213 }],
      },
      {
        version: '0.1.0',
        downloads: 920,
        releaseTag: 'ipinfo/v0.1.0',
        certificationLevel: 2,
        controlsPassed: 14,
        controlsTotal: 15,
        riskScore: 'LOW',
        artifacts: [{ os: 'any', arch: 'any', sizeBytes: 44102 }],
      },
    ],
  },
  {
    name: '@nimblebraininc/postgres',
    description:
      'Query and inspect PostgreSQL databases: run SQL, list schemas, and describe tables.',
    serverType: 'node',
    authorName: 'NimbleBrain',
    githubRepo: 'NimbleBrainInc/mcp-servers',
    versions: [
      {
        version: '1.1.0',
        downloads: 3275,
        releaseTag: 'postgres/v1.1.0',
        certificationLevel: 4,
        controlsPassed: 24,
        controlsTotal: 25,
        riskScore: 'NONE',
        artifacts: [
          { os: 'darwin', arch: 'arm64', sizeBytes: 1203945 },
          { os: 'linux', arch: 'x64', sizeBytes: 1255012 },
        ],
      },
    ],
  },
  {
    name: '@anthropic/github-mcp',
    description: 'GitHub API integration: manage issues, pull requests, and repository contents.',
    serverType: 'node',
    authorName: 'Anthropic',
    githubRepo: 'anthropics/github-mcp',
    versions: [
      {
        version: '1.2.0',
        downloads: 5610,
        releaseTag: 'v1.2.0',
        certificationLevel: 3,
        controlsPassed: 21,
        controlsTotal: 22,
        riskScore: 'LOW',
        artifacts: [{ os: 'any', arch: 'any', sizeBytes: 982310 }],
      },
    ],
  },
];

// Deterministic fake digest (sha256:<64 hex>) for local seed artifacts.
function fakeDigest(seed: string): string {
  let hex = '';
  let acc = 0;
  for (let i = 0; i < seed.length; i++) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 64; i++) {
    acc = (acc * 1103515245 + 12345) >>> 0;
    hex += (acc & 0xf).toString(16);
  }
  return `sha256:${hex}`;
}

function storagePath(scope: string, name: string, version: string, platform?: string): string {
  const file = platform ? `${platform}.mcpb` : 'bundle.mcpb';
  return `@${scope}/${name}/${version}/${file}`;
}

async function main() {
  console.log('Seeding example bundles...\n');

  for (const b of BUNDLES) {
    const [scope, name] = b.name.replace('@', '').split('/');
    const latest = b.versions[0]!.version;
    const totalDownloads = BigInt(b.versions.reduce((sum, v) => sum + v.downloads, 0));

    const pkg = await prisma.package.upsert({
      where: { name: b.name },
      update: {
        description: b.description,
        serverType: b.serverType,
        authorName: b.authorName,
        githubRepo: b.githubRepo,
        latestVersion: latest,
        totalDownloads,
      },
      create: {
        name: b.name,
        description: b.description,
        serverType: b.serverType,
        authorName: b.authorName,
        githubRepo: b.githubRepo,
        latestVersion: latest,
        verified: true,
        totalDownloads,
      },
    });

    console.log(`  Bundle: ${b.name} (${pkg.id})`);

    for (const v of b.versions) {
      const manifest = {
        name: b.name,
        version: v.version,
        description: b.description,
        server_type: b.serverType,
      };

      const version = await prisma.packageVersion.upsert({
        where: { packageId_version: { packageId: pkg.id, version: v.version } },
        update: {
          manifest,
          downloadCount: BigInt(v.downloads),
          releaseTag: v.releaseTag,
          publishMethod: 'oidc',
          provenanceRepository: b.githubRepo,
        },
        create: {
          packageId: pkg.id,
          version: v.version,
          manifest,
          downloadCount: BigInt(v.downloads),
          releaseTag: v.releaseTag,
          releaseUrl: `https://github.com/${b.githubRepo}/releases/tag/${v.releaseTag}`,
          publishMethod: 'oidc',
          provenanceRepository: b.githubRepo,
        },
      });

      for (const a of v.artifacts) {
        const platform = a.os === 'any' && a.arch === 'any' ? undefined : `${a.os}-${a.arch}`;
        await prisma.artifact.upsert({
          where: { versionId_os_arch: { versionId: version.id, os: a.os, arch: a.arch } },
          update: { sizeBytes: BigInt(a.sizeBytes) },
          create: {
            versionId: version.id,
            os: a.os,
            arch: a.arch,
            digest: fakeDigest(`${b.name}@${v.version}/${a.os}-${a.arch}`),
            sizeBytes: BigInt(a.sizeBytes),
            storagePath: storagePath(scope!, name!, v.version, platform),
            sourceUrl: `https://github.com/${b.githubRepo}/releases/download/${v.releaseTag}/${name}.mcpb`,
          },
        });
      }

      const scanId = `seed-${scope}-${name}-${v.version}`;
      await prisma.securityScan.upsert({
        where: { scanId },
        update: {
          status: 'completed',
          riskScore: v.riskScore,
          certificationLevel: v.certificationLevel,
          controlsPassed: v.controlsPassed,
          controlsFailed: v.controlsTotal - v.controlsPassed,
          controlsTotal: v.controlsTotal,
        },
        create: {
          versionId: version.id,
          scanId,
          status: 'completed',
          riskScore: v.riskScore,
          certificationLevel: v.certificationLevel,
          controlsPassed: v.controlsPassed,
          controlsFailed: v.controlsTotal - v.controlsPassed,
          controlsTotal: v.controlsTotal,
          findingsSummary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: v.controlsTotal - v.controlsPassed,
          },
          completedAt: new Date(),
        },
      });

      console.log(
        `    v${v.version}  L${v.certificationLevel} ${v.controlsPassed}/${v.controlsTotal}`,
      );
    }
  }

  console.log(`\nSeeded ${BUNDLES.length} bundles successfully.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });
