import { Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema, generateItemListSchema } from '../lib/schema';

interface Control {
  id: string;
  name: string;
  description: string;
  levels: number[];
  mcpSpecific?: boolean;
  recommended?: boolean;
  legal?: boolean;
}

interface Domain {
  id: string;
  name: string;
  abbrev: string;
  description: string;
  controls: Control[];
}

const DOMAINS: Domain[] = [
  {
    id: 'supply_chain',
    name: 'Supply Chain',
    abbrev: 'SC',
    description: 'Ensures dependencies are known, vulnerability-free, and from trusted sources.',
    controls: [
      {
        id: 'SC-01',
        name: 'SBOM Generation',
        description: 'Bundle includes a Software Bill of Materials (CycloneDX or SPDX format) listing all components.',
        levels: [1, 2, 3, 4],
      },
      {
        id: 'SC-02',
        name: 'Vulnerability Scan',
        description: 'No critical CVEs in KEV, no critical/high CVEs with EPSS > 10%. VEX statements supported for exceptions.',
        levels: [2, 3, 4],
      },
      {
        id: 'SC-03',
        name: 'Dependency Pinning',
        description: 'All dependencies pinned to exact versions via lock files. No floating version ranges.',
        levels: [2, 3, 4],
      },
      {
        id: 'SC-04',
        name: 'License Compliance',
        description: 'Bundle license declared and compatible with all dependency licenses.',
        levels: [3, 4],
        legal: true,
      },
      {
        id: 'SC-05',
        name: 'Trusted Sources',
        description: 'All dependencies from approved registries (npm, PyPI, crates.io). Private registries declared.',
        levels: [3, 4],
      },
    ],
  },
  {
    id: 'code_quality',
    name: 'Code Quality',
    abbrev: 'CQ',
    description: 'Ensures code is free from secrets, malware, and security defects.',
    controls: [
      {
        id: 'CQ-01',
        name: 'No Embedded Secrets',
        description: 'No AWS keys, API tokens, passwords, or private keys in source. Scanned with TruffleHog.',
        levels: [1, 2, 3, 4],
      },
      {
        id: 'CQ-02',
        name: 'No Malicious Patterns',
        description: 'No data exfiltration, typosquatting, crypto miners, backdoors, or malicious install hooks.',
        levels: [1, 2, 3, 4],
      },
      {
        id: 'CQ-03',
        name: 'Static Analysis Clean',
        description: 'Server code passes Bandit/ESLint security analysis with no high-severity findings.',
        levels: [2, 3, 4],
      },
      {
        id: 'CQ-04',
        name: 'Input Validation',
        description: 'All tool parameters validated using schema libraries (Zod, Pydantic, JSON Schema).',
        levels: [3, 4],
      },
      {
        id: 'CQ-05',
        name: 'Safe Execution Patterns',
        description: 'No shell=True, eval(), exec(), or SQL string concatenation in server code.',
        levels: [3, 4],
      },
      {
        id: 'CQ-06',
        name: 'Anti-Slopsquatting',
        description: 'Package name not in LLM hallucination corpus. Protects against AI code generation attacks.',
        levels: [2, 3, 4],
        mcpSpecific: true,
      },
      {
        id: 'CQ-07',
        name: 'Behavioral Analysis',
        description: 'Bundle runs in isolated sandbox. Network, filesystem, and process behavior monitored.',
        levels: [4],
        mcpSpecific: true,
      },
    ],
  },
  {
    id: 'artifact_integrity',
    name: 'Artifact Integrity',
    abbrev: 'AI',
    description: 'Ensures the bundle has not been tampered with and can be cryptographically verified.',
    controls: [
      {
        id: 'AI-01',
        name: 'Valid Manifest',
        description: 'manifest.json present and valid. Required fields: name, version, mcp_config.',
        levels: [1, 2, 3, 4],
      },
      {
        id: 'AI-02',
        name: 'Content Hashes',
        description: 'SHA-256 hashes for all files in manifest. Verified against actual contents.',
        levels: [2, 3, 4],
      },
      {
        id: 'AI-03',
        name: 'Bundle Signature',
        description: 'Cryptographically signed with Sigstore or GPG. Signature verifiable against publisher key.',
        levels: [3, 4],
      },
      {
        id: 'AI-04',
        name: 'Reproducible Build',
        description: 'Independent builds from same source produce identical bundles.',
        levels: [4],
        recommended: true,
      },
    ],
  },
  {
    id: 'provenance',
    name: 'Provenance',
    abbrev: 'PR',
    description: 'Establishes the origin and build process of the bundle.',
    controls: [
      {
        id: 'PR-01',
        name: 'Source Repository',
        description: 'Public source repository linked and accessible. Source matches bundle contents.',
        levels: [2, 3, 4],
      },
      {
        id: 'PR-02',
        name: 'Author Identity',
        description: 'Publisher verified via OIDC (GitHub, Google) or email domain verification.',
        levels: [2, 3, 4],
      },
      {
        id: 'PR-03',
        name: 'Build Attestation',
        description: 'SLSA provenance attestation from trusted builder (GitHub Actions, GitLab CI).',
        levels: [3, 4],
      },
      {
        id: 'PR-04',
        name: 'Commit Linkage',
        description: 'Linked to specific source commit. Signed commits recommended.',
        levels: [4],
        recommended: true,
      },
      {
        id: 'PR-05',
        name: 'Source Repository Health',
        description: 'OpenSSF Scorecard score >= 5.0 (L3) or >= 7.0 (L4). No critical check failures.',
        levels: [3, 4],
      },
    ],
  },
  {
    id: 'capability_declaration',
    name: 'Capability Declaration',
    abbrev: 'CD',
    description: 'Ensures bundles accurately declare their capabilities and permissions.',
    controls: [
      {
        id: 'CD-01',
        name: 'Tool Declaration',
        description: 'All tools declared in manifest with human-readable descriptions.',
        levels: [1, 2, 3, 4],
      },
      {
        id: 'CD-02',
        name: 'Permission Scope',
        description: 'Filesystem, network, environment, subprocess permissions declared in manifest.',
        levels: [2, 3, 4],
      },
      {
        id: 'CD-03',
        name: 'Tool Description Safety',
        description: 'No prompt injection, exfiltration instructions, or hidden directives in tool descriptions.',
        levels: [2, 3, 4],
        mcpSpecific: true,
      },
      {
        id: 'CD-04',
        name: 'Credential Scope Declaration',
        description: 'OAuth scopes and API permissions declared. Least-privilege principle enforced.',
        levels: [3, 4],
        mcpSpecific: true,
      },
    ],
  },
];

const LEVEL_CLASSES = [
  { legend: 'border-mpak-gray-500 text-mpak-gray-500', active: 'bg-mpak-gray-500/15 text-mpak-gray-500' },
  { legend: 'border-terminal-success text-terminal-success', active: 'bg-terminal-success/15 text-terminal-success' },
  { legend: 'border-accent-emerald text-accent-emerald', active: 'bg-accent-emerald/15 text-accent-emerald' },
  { legend: 'border-accent-gold-400 text-accent-gold-400', active: 'bg-accent-gold-400/15 text-accent-gold-400' },
];

export default function SecurityControlsPage() {
  // Build ItemList schema from all controls
  const controlItems = DOMAINS.flatMap(d =>
    d.controls.map(c => ({ name: `${c.id}: ${c.name}`, url: `https://www.mpak.dev/security/controls#${c.id}` }))
  );

  useSEO({
    title: 'Security Controls - mpak Trust Framework',
    description:
      'Complete list of 25 security controls in the mpak Trust Framework (MTF). Each control has clear pass/fail criteria and remediation guidance.',
    canonical: 'https://www.mpak.dev/security/controls',
    keywords: [
      'mpak controls',
      'security controls',
      'mcp security',
      'vulnerability scanning',
      'supply chain security',
    ],
    schema: [
      generateBreadcrumbSchema([
        { name: 'Home', url: 'https://www.mpak.dev/' },
        { name: 'Security', url: 'https://www.mpak.dev/security' },
        { name: 'Controls', url: 'https://www.mpak.dev/security/controls' },
      ]),
      generateItemListSchema(controlItems, 'mpak Trust Framework Security Controls'),
    ],
  });

  const totalControls = DOMAINS.reduce((sum, d) => sum + d.controls.length, 0);
  const mcpSpecificControls = DOMAINS.reduce(
    (sum, d) => sum + d.controls.filter((c) => c.mcpSpecific).length,
    0
  );

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Header */}
      <div className="bg-surface border-b border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-mpak-gray-900 mb-3">
              Security Controls
            </h1>
            <p className="text-lg text-mpak-gray-600 max-w-2xl">
              {totalControls} controls across 5 security domains.{' '}
              <span className="text-terminal-error font-medium">
                {mcpSpecificControls} MCP-specific
              </span>{' '}
              controls address AI attack surfaces.
            </p>
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap items-center gap-6 text-sm font-mono">
            <div className="flex items-center gap-2">
              <span className="text-mpak-gray-500">levels:</span>
              {[1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded border-2 ${LEVEL_CLASSES[level - 1]!.legend}`}
                >
                  {level}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-mpak-gray-500">
              <span className="w-2 h-2 rounded-full bg-terminal-error" />
              <span>mcp-specific</span>
            </div>
            <div className="flex items-center gap-1 text-mpak-gray-500">
              <span className="text-mpak-gray-400">*</span>
              <span>recommended</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-16">
          {DOMAINS.map((domain) => (
            <section key={domain.id}>
              {/* Domain header */}
              <div className="flex items-baseline gap-3 mb-2">
                <h2 className="text-2xl font-semibold text-mpak-gray-900">
                  {domain.name}
                </h2>
                <span className="font-mono text-sm text-mpak-gray-400">
                  {domain.abbrev}-01..{domain.abbrev}-0{domain.controls.length}
                </span>
              </div>
              <p className="text-mpak-gray-600 mb-6 max-w-2xl">
                {domain.description}
              </p>

              {/* Controls list */}
              <div className="bg-surface-raised rounded-lg border border-white/[0.08] divide-y divide-white/[0.08] overflow-hidden">
                {domain.controls.map((control) => (
                  <div
                    key={control.id}
                    id={control.id}
                    className={`relative px-5 py-4 hover:bg-surface-overlay/50 transition-colors ${
                      control.mcpSpecific ? 'bg-terminal-error/[0.02]' : ''
                    }`}
                  >
                    {/* MCP-specific indicator bar */}
                    {control.mcpSpecific && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-terminal-error" />
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Control ID */}
                      <div className="shrink-0 w-16">
                        <span
                          className={`inline-block font-mono text-sm font-medium ${
                            control.mcpSpecific
                              ? 'text-terminal-error'
                              : 'text-mpak-gray-500'
                          }`}
                        >
                          {control.id}
                        </span>
                      </div>

                      {/* Control content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-mpak-gray-900">
                              {control.name}
                              {control.recommended && (
                                <span className="text-mpak-gray-400 ml-1">
                                  *
                                </span>
                              )}
                              {control.legal && (
                                <span className="ml-2 text-xs font-normal text-mpak-gray-500">
                                  legal
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-mpak-gray-600 mt-1 leading-relaxed">
                              {control.description}
                            </p>
                          </div>

                          {/* Level indicators */}
                          <div className="flex items-center gap-1 shrink-0">
                            {[1, 2, 3, 4].map((level) => {
                              const active = control.levels.includes(level);
                              return (
                                <span
                                  key={level}
                                  className={`inline-flex items-center justify-center w-5 h-5 text-xs font-mono rounded ${
                                    active
                                      ? `font-bold ${LEVEL_CLASSES[level - 1]!.active}`
                                      : 'text-mpak-gray-400'
                                  }`}
                                >
                                  {level}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.08]">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <Link
              to="/security"
              className="inline-flex items-center gap-2 text-accent-gold-400 hover:text-accent-gold-500 font-medium"
            >
              <span aria-hidden="true">&larr;</span>
              Certification Overview
            </Link>
            <a
              href="https://mpaktrust.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-mpak-gray-500 hover:text-mpak-gray-700"
            >
              Full MTF Specification
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
