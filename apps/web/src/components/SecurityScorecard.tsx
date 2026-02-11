import { Link } from 'react-router-dom';
import type { SecurityScan } from '../schemas/generated/api-responses';

// Domain display order
const DOMAIN_ORDER = [
  'supply_chain',
  'code_quality',
  'artifact_integrity',
  'provenance',
  'capability_declaration',
] as const;

// Certification levels from the MTF (must match SecurityPage.tsx)
const CERT_LEVELS = [
  { level: 1, name: 'Basic', grade: 'L1', controls: 5, color: '#64748b', bg: 'bg-surface text-mpak-gray-600' },
  { level: 2, name: 'Standard', grade: 'L2', controls: 14, color: '#22c55e', bg: 'bg-terminal-success/15 text-terminal-success' },
  { level: 3, name: 'Verified', grade: 'L3', controls: 22, color: '#10b981', bg: 'bg-accent-emerald/15 text-accent-emerald' },
  { level: 4, name: 'Attested', grade: 'L4', controls: 25, color: '#f59e0b', bg: 'bg-accent-gold-400/15 text-accent-gold-400' },
];

// Controls required per certification level (must match scanner models.py CONTROL_LEVELS)
const LEVEL_REQUIREMENTS: Record<number, string[]> = {
  1: ['AI-01', 'SC-01', 'CQ-01', 'CQ-02', 'CD-01'],
  2: ['AI-01', 'AI-05', 'SC-01', 'SC-02', 'SC-03', 'SC-04', 'CQ-01', 'CQ-02', 'CQ-03', 'CD-01', 'CD-02', 'CD-03', 'PR-01', 'PR-02'],
  3: ['AI-01', 'AI-03', 'AI-05', 'SC-01', 'SC-02', 'SC-03', 'SC-04', 'SC-05', 'CQ-01', 'CQ-02', 'CQ-03', 'CQ-04', 'CQ-05', 'CD-01', 'CD-02', 'CD-03', 'CD-04', 'CD-05', 'PR-01', 'PR-02', 'PR-03', 'PR-05'],
  4: ['AI-01', 'AI-03', 'AI-04', 'AI-05', 'SC-01', 'SC-02', 'SC-03', 'SC-04', 'SC-05', 'CQ-01', 'CQ-02', 'CQ-03', 'CQ-04', 'CQ-05', 'CQ-06', 'CD-01', 'CD-02', 'CD-03', 'CD-04', 'CD-05', 'PR-01', 'PR-02', 'PR-03', 'PR-04', 'PR-05'],
};

// Score color mapping: 0-39 red, 40-69 amber, 70-89 blue, 90-100 green
function scoreColor(score: number): { ring: string; text: string } {
  if (score >= 90) return { ring: '#22c55e', text: 'text-terminal-success' };
  if (score >= 70) return { ring: '#3b82f6', text: 'text-terminal-info' };
  if (score >= 40) return { ring: '#f59e0b', text: 'text-terminal-warning' };
  return { ring: '#ef4444', text: 'text-terminal-error' };
}

function certBadge(level: number | null | undefined): { bg: string; label: string } {
  if (!level || level === 0) return { bg: 'bg-surface text-mpak-gray-500', label: 'Not Certified' };
  const cert = CERT_LEVELS.find(c => c.level === level);
  return cert
    ? { bg: cert.bg, label: `${cert.grade} ${cert.name}` }
    : { bg: 'bg-surface text-mpak-gray-500', label: 'Not Certified' };
}

// Find the next certification level to aim for
function nextCertLevel(currentLevel: number | null | undefined): typeof CERT_LEVELS[number] | null {
  if (!currentLevel || currentLevel === 0) return CERT_LEVELS[0]; // Not certified -> aim for L1
  return CERT_LEVELS.find(c => c.level === currentLevel + 1) ?? null;
}

// Find controls required for a level that aren't currently passing
function getBlockingControls(
  domains: SecurityScan['domains'] | undefined,
  targetLevel: number,
): Array<{ id: string; name: string }> {
  const required = LEVEL_REQUIREMENTS[targetLevel];
  if (!required || !domains) return [];

  // Build a flat map of all controls from all domains
  const allControls: Record<string, { status: string; name: string }> = {};
  for (const domain of Object.values(domains)) {
    if (domain.controls) {
      for (const [id, ctrl] of Object.entries(domain.controls)) {
        allControls[id] = ctrl;
      }
    }
  }

  return required
    .filter(id => {
      const ctrl = allControls[id];
      return !ctrl || ctrl.status !== 'pass';
    })
    .map(id => ({
      id,
      name: allControls[id]?.name ?? 'Not yet scanned',
    }));
}

// Bar color based on pass rate (no red — bars show progress, not danger)
function barColor(passed: number, total: number): string {
  if (total === 0) return 'bg-mpak-gray-400';
  const pct = passed / total;
  if (pct >= 0.75) return 'bg-terminal-success';
  if (pct >= 0.4) return 'bg-terminal-info';
  return 'bg-terminal-warning';
}

// Control status styling (dot + text color)
function controlStyle(status: string): { dot: string; text: string } {
  switch (status) {
    case 'pass': return { dot: 'bg-terminal-success', text: 'text-terminal-success' };
    case 'fail': return { dot: 'bg-terminal-warning', text: 'text-terminal-warning' };
    case 'skip': return { dot: 'bg-mpak-gray-500', text: 'text-mpak-gray-400' };
    default: return { dot: 'bg-terminal-error', text: 'text-terminal-error' }; // error
  }
}

// Severity badge styles
function severityBadge(severity: string): { bg: string; numBg: string; numText: string } {
  switch (severity) {
    case 'critical': return { bg: 'bg-terminal-error/15 text-terminal-error', numBg: 'bg-terminal-error/15', numText: 'text-terminal-error' };
    case 'high': return { bg: 'bg-terminal-error/15 text-terminal-error', numBg: 'bg-terminal-error/15', numText: 'text-terminal-error' };
    case 'medium': return { bg: 'bg-terminal-warning/15 text-terminal-warning', numBg: 'bg-terminal-warning/15', numText: 'text-terminal-warning' };
    case 'low': return { bg: 'bg-terminal-warning/15 text-terminal-warning', numBg: 'bg-terminal-warning/15', numText: 'text-terminal-warning' };
    default: return { bg: 'bg-surface text-mpak-gray-500', numBg: 'bg-surface', numText: 'text-mpak-gray-500' };
  }
}

interface SecurityScorecardProps {
  scan: SecurityScan;
}

export default function SecurityScorecard({ scan }: SecurityScorecardProps) {
  const cert = scan.certification;
  const controlsPassed = cert?.controls_passed ?? 0;
  const controlsTotal = cert?.controls_total ?? 1;
  const score = Math.round((controlsPassed / controlsTotal) * 100);
  const colors = scoreColor(score);
  const badge = certBadge(cert?.level);

  // SVG ring math: r=65, circumference = 2 * PI * 65 ≈ 408.4
  const circumference = 2 * Math.PI * 65;
  const strokeOffset = circumference * (1 - score / 100);

  const domains = scan.domains;
  const findings = scan.findings;

  // Build verdict description anchored to certification levels
  const certLevel = cert?.level ?? 0;
  const next = nextCertLevel(certLevel);
  const blockingControls = next ? getBlockingControls(domains, next.level) : [];
  let description: string;

  if (certLevel > 0) {
    const achieved = CERT_LEVELS.find(c => c.level === certLevel)!;
    description = `This bundle is ${achieved.grade} ${achieved.name} certified, passing ${controlsPassed} of ${controlsTotal} security controls.`;
  } else {
    description = `This bundle passes ${controlsPassed} of ${controlsTotal} security controls. Certification requires all controls for a level to pass.`;
  }

  return (
    <>
      {/* === Score Hero === */}
      <section className="bg-surface-raised border border-white/[0.08] rounded-xl p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          {/* Score Ring */}
          <div className="relative flex-shrink-0">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle
                cx="80" cy="80" r="65"
                fill="none" strokeWidth="12" strokeLinecap="round"
                className="stroke-surface-overlay"
              />
              <circle
                cx="80" cy="80" r="65"
                fill="none" strokeWidth="12" strokeLinecap="round"
                stroke={colors.ring}
                strokeDasharray={circumference}
                strokeDashoffset={circumference}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                  animation: 'scorecard-fill-ring 1.2s ease-out forwards 0.3s',
                  ['--scorecard-target-offset' as string]: strokeOffset,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold text-mpak-gray-900">{score}</span>
              <span className="text-xs text-mpak-gray-400 font-medium">/ 100</span>
            </div>
          </div>

          {/* Verdict */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <h2 className="text-xl font-bold text-mpak-gray-900">{controlsPassed}/{controlsTotal} Controls</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-mpak-gray-600 text-sm leading-relaxed mb-3">{description}</p>
            {next && blockingControls.length > 0 && (
              <div className="bg-surface rounded-lg px-3 py-2.5 mb-3 text-xs">
                <p className="text-mpak-gray-600 font-medium mb-1.5">
                  {certLevel > 0 ? 'Next' : 'Target'}: {next.grade} {next.name} ({next.controls} controls) &mdash; {blockingControls.length} not yet passing:
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {blockingControls.map(ctrl => (
                    <span key={ctrl.id} className="flex items-center gap-1 text-terminal-warning">
                      <span className="w-1.5 h-1.5 rounded-full bg-terminal-warning flex-shrink-0" />
                      <span className="font-mono">{ctrl.id}</span> {ctrl.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {next && blockingControls.length === 0 && (
              <div className="bg-terminal-success/10 rounded-lg px-3 py-2.5 mb-3 text-xs text-terminal-success font-medium">
                All {next.grade} {next.name} controls are passing. Certification updates on next scan.
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-mpak-gray-400">
              {scan.summary && scan.summary.components > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  {scan.summary.components} dependencies
                </span>
              )}
              {scan.scanned_at && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Scanned {new Date(scan.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === Domain Breakdown === */}
      {domains && Object.keys(domains).length > 0 && (
        <section className="bg-surface-raised border border-white/[0.08] rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-mpak-gray-900">Score Breakdown</h3>
            <div className="flex items-center gap-4 text-xs text-mpak-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-terminal-success" />
                Passed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-terminal-warning" />
                Failed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-mpak-gray-500" />
                Skipped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-terminal-error" />
                Error
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {DOMAIN_ORDER.filter(key => domains[key]).map((domainKey, i) => {
              const domain = domains[domainKey]!;
              const pct = domain.controls_total > 0
                ? Math.round((domain.controls_passed / domain.controls_total) * 100)
                : 0;

              return (
                <div
                  key={domainKey}
                  className="scorecard-fade-up"
                  style={{ ['--scorecard-delay' as string]: `${0.1 * (i + 1)}s` }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-mpak-gray-700">{domain.display_name}</span>
                    <span className="text-sm text-mpak-gray-500">
                      {domain.controls_passed}/{domain.controls_total}
                    </span>
                  </div>
                  <div className="h-2.5 bg-surface rounded-full overflow-hidden">
                    <div
                      className={`scorecard-bar-fill h-full ${barColor(domain.controls_passed, domain.controls_total)} rounded-full`}
                      style={{
                        width: `${pct}%`,
                        ['--scorecard-delay' as string]: `${0.4 + 0.1 * i}s`,
                      }}
                    />
                  </div>
                  {domain.controls && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                      {Object.entries(domain.controls).map(([controlId, control]) => {
                        const style = controlStyle(control.status);
                        return (
                          <span key={controlId} className={`flex items-center gap-1 ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} />
                            {controlId} {control.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* === What to Fix === */}
      {findings && findings.length > 0 && (
        <section className="bg-surface-raised border border-white/[0.08] rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-mpak-gray-900">What to Fix</h3>
            <span className="text-xs text-mpak-gray-400">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}, ordered by impact
            </span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {findings.map((finding, idx) => {
              const badge = severityBadge(finding.severity);
              return (
                <div key={finding.id} className="py-3 flex items-start gap-3 transition-colors hover:bg-surface-overlay">
                  <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full ${badge.numBg} ${badge.numText} flex items-center justify-center text-xs font-bold`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge.bg}`}>
                        {finding.severity.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-mpak-gray-900">{finding.title}</span>
                    </div>
                    <p className="text-xs text-mpak-gray-500">{finding.description}</p>
                    <p className="text-xs text-mpak-gray-400 mt-1">
                      <span className="font-mono text-xs">{finding.control}</span>
                      {finding.file && (
                        <>
                          {' \u00b7 '}
                          <span className="font-mono">{finding.file}</span>
                          {finding.line && `:${finding.line}`}
                        </>
                      )}
                      {finding.remediation && (
                        <>
                          {' \u00b7 '}
                          Fix: {finding.remediation}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* === Footer === */}
      <section className="flex items-center justify-between text-sm text-mpak-gray-400 px-1">
        <div className="flex gap-4">
          <Link to="/security" className="hover:text-accent-gold-400">About mpak Security</Link>
          <Link to="/security/controls" className="hover:text-accent-gold-400">View all 25 controls</Link>
        </div>
      </section>

      {/* CSS-only animations */}
      <style>{`
        @keyframes scorecard-fill-ring {
          to { stroke-dashoffset: var(--scorecard-target-offset); }
        }
        @keyframes scorecard-grow-bar {
          to { transform: scaleX(1); }
        }
        @keyframes scorecard-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scorecard-bar-fill {
          transform-origin: left;
          transform: scaleX(0);
          animation: scorecard-grow-bar 0.8s ease-out forwards;
          animation-delay: var(--scorecard-delay, 0.4s);
        }
        .scorecard-fade-up {
          opacity: 0;
          animation: scorecard-fade-up 0.5s ease forwards;
          animation-delay: var(--scorecard-delay, 0s);
        }
      `}</style>
    </>
  );
}
