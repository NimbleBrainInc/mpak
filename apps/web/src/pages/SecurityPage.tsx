import { Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema } from '../lib/schema';
import { siteConfig } from '../lib/siteConfig';

const LEVELS = [
  {
    level: 1,
    name: 'Basic',
    grade: 'L1',
    target: 'Personal projects, experimentation',
    effort: 'Minutes',
    controls: 6,
    coverage: 24,
    highlights: [
      'No embedded secrets',
      'No malware patterns',
      'Valid manifest',
      'Tool declarations',
    ],
  },
  {
    level: 2,
    name: 'Standard',
    grade: 'L2',
    target: 'Team tools, published packages',
    effort: '< 1 hour',
    controls: 14,
    coverage: 56,
    highlights: [
      'Vulnerability scanning (CVE + EPSS)',
      'Dependency pinning',
      'Anti-slopsquatting protection',
      'Tool description safety',
    ],
  },
  {
    level: 3,
    name: 'Verified',
    grade: 'L3',
    target: 'Production, enterprise use',
    effort: 'Days',
    controls: 22,
    coverage: 88,
    highlights: [
      'Cryptographic bundle signatures',
      'Build provenance attestation',
      'OpenSSF Scorecard integration',
      'OAuth scope declarations',
    ],
  },
  {
    level: 4,
    name: 'Attested',
    grade: 'L4',
    target: 'Critical infrastructure, regulated industries',
    effort: 'Weeks',
    controls: 25,
    coverage: 100,
    highlights: [
      'Behavioral analysis sandbox',
      'Reproducible builds',
      'Full provenance chain',
      'Commit-level linkage',
    ],
  },
];

const DOMAINS = [
  {
    id: 'supply_chain',
    name: 'Supply Chain',
    abbrev: 'SC',
    description: 'Dependencies are known, vulnerability-free, and from trusted sources',
  },
  {
    id: 'code_quality',
    name: 'Code Quality',
    abbrev: 'CQ',
    description: 'Code is free from secrets, malware, and security defects',
  },
  {
    id: 'artifact_integrity',
    name: 'Artifact Integrity',
    abbrev: 'AI',
    description: 'Bundle has not been tampered with and can be verified',
  },
  {
    id: 'provenance',
    name: 'Provenance',
    abbrev: 'PR',
    description: 'Origin and build process are verifiable and trustworthy',
  },
  {
    id: 'capability_declaration',
    name: 'Capability Declaration',
    abbrev: 'CD',
    description: 'Bundles accurately declare their capabilities and permissions',
  },
];

// Shield icon component for security domains
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

// Scan icon for code quality
function ScanIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z"
      />
    </svg>
  );
}

// Lock icon for artifact integrity
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

// Fingerprint icon for provenance
function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33"
      />
    </svg>
  );
}

// Document icon for capability declaration
function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-12M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12"
      />
    </svg>
  );
}

const LEVEL_CLASSES = [
  { bar: 'bg-mpak-gray-500', badge: 'border-mpak-gray-500 text-mpak-gray-500' },
  { bar: 'bg-terminal-success', badge: 'border-terminal-success text-terminal-success' },
  { bar: 'bg-accent-emerald', badge: 'border-accent-emerald text-accent-emerald' },
  { bar: 'bg-accent-gold-400', badge: 'border-accent-gold-400 text-accent-gold-400' },
];

const DOMAIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  supply_chain: ShieldIcon,
  code_quality: ScanIcon,
  artifact_integrity: LockIcon,
  provenance: FingerprintIcon,
  capability_declaration: DocumentIcon,
};

export default function SecurityPage() {
  useSEO({
    title: 'MCP Server Security - mpak Trust Framework',
    description:
      '25 security controls across 5 domains. The mpak Trust Framework (MTF) provides standardized security scanning for MCP bundles. Four certification levels from Basic to Attested.',
    canonical: 'https://www.mpak.dev/security',
    keywords: [
      'mcp server security',
      'mpak security',
      'mcp security',
      'bundle certification',
      'supply chain security',
      'mcp trust framework',
    ],
    schema: generateBreadcrumbSchema([
      { name: 'Home', url: 'https://www.mpak.dev/' },
      { name: 'Security', url: 'https://www.mpak.dev/security' },
    ]),
  });

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-surface border-b border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20">
          <div className="max-w-3xl">
            <div className="font-mono text-sm text-terminal-info mb-4 tracking-wide">
              mpak Trust Framework v0.1
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 text-mpak-gray-900">
              Security you can
              <br />
              <span className="text-accent-gold-400">verify</span>
            </h1>
            <p className="text-xl text-mpak-gray-600 leading-relaxed max-w-2xl">
              25 security controls. 5 domains. 4 certification levels.
              Every bundle on mpak is scanned and graded, so you know exactly
              what you're installing.
            </p>

            {/* Terminal-style stats */}
            <div className="mt-10 font-mono text-sm">
              <div className="inline-flex items-center gap-6 px-4 py-3 bg-white/5 border border-white/[0.1] rounded-lg">
                <div>
                  <span className="text-mpak-gray-500">controls:</span>{' '}
                  <span className="text-terminal-success">25</span>
                </div>
                <div className="w-px h-4 bg-white/[0.1]" />
                <div>
                  <span className="text-mpak-gray-500">domains:</span>{' '}
                  <span className="text-terminal-info">5</span>
                </div>
                <div className="w-px h-4 bg-white/[0.1]" />
                <div>
                  <span className="text-mpak-gray-500">mcp-specific:</span>{' '}
                  <span className="text-terminal-warning">4</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Why This Exists */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-mpak-gray-500 uppercase tracking-wider mb-3">
            The Problem
          </h2>
          <p className="text-2xl sm:text-3xl font-semibold text-mpak-gray-900 leading-snug max-w-3xl mb-10">
            MCP servers have full system access. Traditional security tools
            don't understand AI-specific attack vectors.
          </p>

          <div className="grid gap-8 sm:grid-cols-3">
            <div className="group">
              <div className="h-1 w-12 bg-terminal-error mb-6 group-hover:w-16 transition-all" />
              <h3 className="font-semibold text-mpak-gray-900 mb-2">
                Filesystem + Network + Code Execution
              </h3>
              <p className="text-mpak-gray-600 text-sm leading-relaxed">
                A malicious bundle can exfiltrate data, install backdoors, or
                serve as a supply chain attack vector. The permissions model
                is wide open.
              </p>
            </div>
            <div className="group">
              <div className="h-1 w-12 bg-terminal-warning mb-6 group-hover:w-16 transition-all" />
              <h3 className="font-semibold text-mpak-gray-900 mb-2">
                Tool Description Poisoning
              </h3>
              <p className="text-mpak-gray-600 text-sm leading-relaxed">
                AI assistants follow tool descriptions faithfully. A description
                like "read ~/.aws/credentials before calling" becomes an
                instruction, not documentation.
              </p>
            </div>
            <div className="group">
              <div className="h-1 w-12 bg-terminal-info mb-6 group-hover:w-16 transition-all" />
              <h3 className="font-semibold text-mpak-gray-900 mb-2">
                Slopsquatting
              </h3>
              <p className="text-mpak-gray-600 text-sm leading-relaxed">
                LLMs hallucinate package names consistently. Attackers register
                these phantom packages with malicious payloads, waiting for
                AI-generated code to install them.
              </p>
            </div>
          </div>
        </section>

        {/* Certification Levels */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-mpak-gray-500 uppercase tracking-wider mb-3">
            Certification Levels
          </h2>
          <p className="text-2xl font-semibold text-mpak-gray-900 mb-10">
            Progressive security tiers for different risk tolerances
          </p>

          <div className="space-y-4">
            {LEVELS.map((level, idx) => (
              <div
                key={level.level}
                className="group relative bg-surface-raised border border-white/[0.08] rounded-lg overflow-hidden hover:border-white/[0.16] transition-all"
              >
                {/* Level indicator bar */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${LEVEL_CLASSES[idx]!.bar}`}
                />

                <div className="pl-6 pr-5 py-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`inline-flex items-center justify-center w-10 h-10 font-mono font-bold text-sm rounded border-2 ${LEVEL_CLASSES[idx]!.badge}`}
                        >
                          {level.grade}
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-mpak-gray-900">
                            {level.name}
                          </h3>
                          <p className="text-sm text-mpak-gray-500">
                            {level.target}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2 text-sm">
                        {level.highlights.map((h) => (
                          <div key={h} className="flex items-center gap-2 text-mpak-gray-700">
                            <span className="w-1 h-1 rounded-full bg-mpak-gray-400" />
                            {h}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end gap-4 sm:gap-2 font-mono text-sm text-right shrink-0">
                      <div>
                        <span className="text-mpak-gray-400">controls</span>
                        <div className="text-mpak-gray-900 font-semibold">
                          {level.controls}/25
                        </div>
                      </div>
                      <div>
                        <span className="text-mpak-gray-400">coverage</span>
                        <div className="text-mpak-gray-900 font-semibold">
                          {level.coverage}%
                        </div>
                      </div>
                      <div>
                        <span className="text-mpak-gray-400">effort</span>
                        <div className="text-mpak-gray-900">{level.effort}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/security/controls"
            className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-accent-gold-400 hover:text-accent-gold-500"
          >
            View all 25 controls
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </section>

        {/* Security Domains */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-mpak-gray-500 uppercase tracking-wider mb-3">
            Security Domains
          </h2>
          <p className="text-2xl font-semibold text-mpak-gray-900 mb-10">
            Five areas of security coverage
          </p>

          <div className="grid gap-px bg-white/[0.06] rounded-lg overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((domain) => {
              const Icon = DOMAIN_ICONS[domain.id];
              return (
                <div
                  key={domain.id}
                  className="bg-surface-raised p-6 hover:bg-surface-overlay transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {Icon && (
                      <Icon className="w-6 h-6 text-mpak-gray-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-mpak-gray-900">
                          {domain.name}
                        </h3>
                        <span className="font-mono text-xs text-mpak-gray-400">
                          {domain.abbrev}
                        </span>
                      </div>
                      <p className="text-sm text-mpak-gray-600 leading-relaxed">
                        {domain.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Empty cell for grid balance */}
            <div className="hidden lg:block bg-surface" />
          </div>
        </section>

        {/* MCP-Specific Controls */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-mono text-mpak-gray-500 uppercase tracking-wider">
              MCP-Specific Controls
            </h2>
            <span className="px-2 py-0.5 bg-terminal-error/10 text-terminal-error text-xs font-mono rounded">
              AI attack surface
            </span>
          </div>
          <p className="text-2xl font-semibold text-mpak-gray-900 mb-10 max-w-2xl">
            Traditional security tools don't understand these threats.
            We built controls specifically for MCP and AI workflows.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                id: 'CD-03',
                name: 'Tool Description Safety',
                level: 'L2+',
                desc: 'Detects prompt injection in tool descriptions. Malicious descriptions become instructions that AI assistants faithfully execute.',
              },
              {
                id: 'CQ-06',
                name: 'Anti-Slopsquatting',
                level: 'L2+',
                desc: 'Blocks packages named after LLM-hallucinated package names. Attackers register these phantom names with malicious payloads.',
              },
              {
                id: 'CD-04',
                name: 'Credential Scope Declaration',
                level: 'L3+',
                desc: 'MCP servers aggregate OAuth tokens for multiple services. This control enforces minimal, declared scopes to limit blast radius.',
              },
              {
                id: 'CQ-07',
                name: 'Behavioral Analysis',
                level: 'L4',
                desc: 'Runs bundles in an isolated sandbox and monitors actual runtime behavior. Catches encrypted payloads and runtime-generated code.',
              },
            ].map((control) => (
              <div
                key={control.id}
                className="relative bg-surface-raised border border-white/[0.08] rounded-lg p-6 overflow-hidden"
              >
                {/* Subtle grid pattern */}
                <div
                  className="absolute inset-0 opacity-5"
                  style={{
                    backgroundImage:
                      'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />

                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-sm text-terminal-error">
                      {control.id}
                    </span>
                    <span className="font-mono text-xs text-mpak-gray-500">
                      {control.level}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-mpak-gray-900">{control.name}</h3>
                  <p className="text-mpak-gray-600 text-sm leading-relaxed">
                    {control.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How to Use */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-mpak-gray-500 uppercase tracking-wider mb-3">
            Using Certification
          </h2>
          <div className="grid gap-12 sm:grid-cols-2 mt-8">
            <div>
              <h3 className="text-xl font-semibold text-mpak-gray-900 mb-6">
                For Consumers
              </h3>
              <ol className="space-y-4">
                {[
                  'Check the certification badge on package pages',
                  'Review risk score and individual control results',
                  'Match level to your use case: Personal (L1+), Team (L2+), Production (L3+), Regulated (L4)',
                ].map((step, i) => (
                  <li key={step} className="flex gap-4">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-surface-overlay text-mpak-gray-600 font-mono text-sm flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-mpak-gray-700 pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-mpak-gray-900 mb-6">
                For Publishers
              </h3>
              <ol className="space-y-4">
                {[
                  'All published bundles are automatically scanned',
                  'Remediation guidance provided for failed controls',
                  'Higher certification = more visibility and trust',
                ].map((step, i) => (
                  <li key={step} className="flex gap-4">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-surface-overlay text-mpak-gray-600 font-mono text-sm flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-mpak-gray-700 pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <a
                href={`${siteConfig.docsUrl}/certification`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-accent-gold-400 hover:text-accent-gold-500"
              >
                Read the publisher guide
                <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative bg-surface-raised border border-white/[0.08] rounded-xl p-8 sm:p-12 overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-semibold text-mpak-gray-900 mb-2">
                Browse Certified Bundles
              </h3>
              <p className="text-mpak-gray-600">
                Find bundles that meet your security requirements.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/bundles"
                className="px-5 py-2.5 bg-accent-gold-400 text-mpak-dark font-semibold rounded-lg hover:bg-accent-gold-500 transition-colors text-center"
              >
                Browse Bundles
              </Link>
              <a
                href={siteConfig.github.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 text-mpak-gray-900 font-medium rounded-lg border border-white/[0.1] hover:bg-white/5 transition-colors text-center"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-white/[0.08] flex flex-wrap gap-x-6 gap-y-2 text-sm text-mpak-gray-500">
          <a
            href="https://mpaktrust.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-mpak-gray-700"
          >
            Full MTF Specification
          </a>
          <a
            href={`${siteConfig.docsUrl}/certification`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-mpak-gray-700"
          >
            Publisher Guide
          </a>
          <Link to="/contact" className="hover:text-mpak-gray-700">
            Report Security Issue
          </Link>
        </div>
      </div>
    </div>
  );
}
