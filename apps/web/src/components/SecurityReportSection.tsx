import { useState } from 'react';

interface VulnerabilityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface SecurityScanSummary {
  components: number;
  vulnerabilities: VulnerabilityCounts;
  secrets: number;
  malicious: number;
  code_issues: number;
}

interface ScanResult {
  scanner: string;
  success: boolean;
  error: string | null;
  findings?: Array<{
    type: string;
    severity: string;
    name: string;
    message?: string;
    version?: string;
    purl?: string;
    cve?: string;
    path?: string;
    line?: number;
  }>;
}

interface Certification {
  level: number | null;
  level_name: string | null;
  controls_passed: number | null;
  controls_failed: number | null;
  controls_total: number | null;
}

interface SecurityScan {
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  risk_score: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  scanned_at: string | Date | null;
  certification?: Certification | null;
  summary?: SecurityScanSummary;
  scans?: Record<string, ScanResult>;
}

interface Props {
  securityScan: SecurityScan | null | undefined;
  version: string;
}

function formatDate(date: string | Date | null): string {
  if (!date) return 'Unknown';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getRiskScoreColor(score: string | null): string {
  switch (score) {
    case 'CRITICAL':
      return 'bg-terminal-error/15 text-terminal-error border-terminal-error/25';
    case 'HIGH':
      return 'bg-terminal-error/10 text-terminal-error border-terminal-error/20';
    case 'MEDIUM':
      return 'bg-accent-gold-400/10 text-accent-gold-400 border-accent-gold-border';
    case 'LOW':
      return 'bg-terminal-success/10 text-terminal-success border-terminal-success/20';
    default:
      return 'bg-surface-raised text-mpak-gray-600 border-white/[0.08]';
  }
}

function getCertificationBadgeStyle(level: number | null): { bg: string; text: string; border: string } {
  switch (level) {
    case 1:
      return { bg: 'bg-terminal-info/15', text: 'text-terminal-info', border: 'border-terminal-info/25' };
    case 2:
      return { bg: 'bg-terminal-success/15', text: 'text-terminal-success', border: 'border-terminal-success/25' };
    case 3:
      return { bg: 'bg-accent-emerald/15', text: 'text-accent-emerald', border: 'border-accent-emerald/25' };
    case 4:
      return { bg: 'bg-accent-gold-400/15', text: 'text-accent-gold-400', border: 'border-accent-gold-border' };
    default:
      return { bg: 'bg-surface', text: 'text-mpak-gray-500', border: 'border-white/[0.08]' };
  }
}

function getRiskScoreIcon(score: string | null) {
  const iconClass = 'w-5 h-5';

  if (score === 'LOW') {
    return (
      <svg className={`${iconClass} text-terminal-success`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    );
  } else if (score === 'MEDIUM') {
    return (
      <svg className={`${iconClass} text-accent-gold-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  } else if (score === 'HIGH' || score === 'CRITICAL') {
    return (
      <svg className={`${iconClass} text-terminal-error`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  return (
    <svg className={`${iconClass} text-mpak-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function SecurityReportSection({ securityScan, version }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Not scanned yet
  if (!securityScan) {
    return (
      <div className="bg-surface-raised rounded-lg border border-white/[0.08] p-4 mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-mpak-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-mpak-gray-500 text-sm">Security scan not yet available for v{version}</span>
        </div>
      </div>
    );
  }

  // Scan in progress
  if (securityScan.status === 'pending' || securityScan.status === 'scanning') {
    return (
      <div className="bg-terminal-info/10 rounded-lg border border-terminal-info/20 p-4 mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-terminal-info animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-terminal-info text-sm font-medium">Security scan in progress...</span>
        </div>
      </div>
    );
  }

  // Scan failed
  if (securityScan.status === 'failed') {
    return (
      <div className="bg-terminal-error/10 rounded-lg border border-terminal-error/20 p-4 mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-terminal-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-terminal-error text-sm font-medium">Security scan failed</span>
        </div>
      </div>
    );
  }

  // Scan completed
  const summary = securityScan.summary;
  const certification = securityScan.certification;
  const totalVulns = summary
    ? summary.vulnerabilities.critical + summary.vulnerabilities.high + summary.vulnerabilities.medium + summary.vulnerabilities.low
    : 0;
  const criticalFindings = summary
    ? summary.vulnerabilities.critical + summary.vulnerabilities.high + summary.secrets + summary.malicious
    : 0;
  const certStyle = getCertificationBadgeStyle(certification?.level ?? null);

  return (
    <div className={`rounded-lg border p-4 mb-6 ${getRiskScoreColor(securityScan.risk_score)}`}>
      {/* Certification badge */}
      {certification && certification.level !== null && certification.level > 0 && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${certStyle.bg} ${certStyle.border} border mb-3`}>
          <svg className={`w-4 h-4 ${certStyle.text}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className={`text-sm font-semibold ${certStyle.text}`}>
            Certified Level {certification.level}: {certification.level_name}
          </span>
          {certification.controls_passed !== null && certification.controls_total !== null && (
            <span className={`text-xs ${certStyle.text} opacity-75`}>
              ({certification.controls_passed}/{certification.controls_total} controls)
            </span>
          )}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {getRiskScoreIcon(securityScan.risk_score)}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-mpak-gray-900">
                Security Scan: {securityScan.risk_score || 'Unknown'} Risk
              </span>
              {securityScan.risk_score === 'LOW' && criticalFindings === 0 && (
                <span className="text-xs bg-terminal-success text-mpak-dark px-2 py-0.5 rounded-full font-medium">
                  No Issues
                </span>
              )}
            </div>
            <div className="text-sm text-mpak-gray-500 mt-1 space-x-2">
              {summary && (
                <>
                  <span>{summary.components} components</span>
                  <span className="text-mpak-gray-300">|</span>
                  <span>{totalVulns} vulnerabilities</span>
                  {summary.secrets > 0 && (
                    <>
                      <span className="text-mpak-gray-300">|</span>
                      <span className="text-terminal-error">{summary.secrets} secrets</span>
                    </>
                  )}
                </>
              )}
              <span className="text-mpak-gray-300">|</span>
              <span>Scanned {formatDate(securityScan.scanned_at)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-mpak-gray-500 hover:text-mpak-gray-900 font-medium flex items-center gap-1"
        >
          {isExpanded ? 'Hide details' : 'View details'}
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && securityScan.scans && (
        <div className="mt-4 pt-4 border-t border-white/[0.1] space-y-4">
          {/* Vulnerability breakdown */}
          {summary && totalVulns > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-mpak-gray-700 mb-2">Vulnerabilities by Severity</h4>
              <div className="flex flex-wrap gap-3">
                {summary.vulnerabilities.critical > 0 && (
                  <span className="inline-flex items-center gap-1 bg-terminal-error/15 text-terminal-error px-2 py-1 rounded text-xs font-medium">
                    <span className="w-2 h-2 bg-terminal-error rounded-full"></span>
                    {summary.vulnerabilities.critical} Critical
                  </span>
                )}
                {summary.vulnerabilities.high > 0 && (
                  <span className="inline-flex items-center gap-1 bg-terminal-error/10 text-terminal-error px-2 py-1 rounded text-xs font-medium">
                    <span className="w-2 h-2 bg-terminal-error/70 rounded-full"></span>
                    {summary.vulnerabilities.high} High
                  </span>
                )}
                {summary.vulnerabilities.medium > 0 && (
                  <span className="inline-flex items-center gap-1 bg-accent-gold-400/15 text-accent-gold-400 px-2 py-1 rounded text-xs font-medium">
                    <span className="w-2 h-2 bg-accent-gold-400 rounded-full"></span>
                    {summary.vulnerabilities.medium} Medium
                  </span>
                )}
                {summary.vulnerabilities.low > 0 && (
                  <span className="inline-flex items-center gap-1 bg-terminal-info/15 text-terminal-info px-2 py-1 rounded text-xs font-medium">
                    <span className="w-2 h-2 bg-terminal-info rounded-full"></span>
                    {summary.vulnerabilities.low} Low
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Scan results by scanner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(securityScan.scans).map(([scanType, result]) => (
              <div
                key={scanType}
                className={`p-3 rounded-lg border ${
                  result.success ? 'bg-surface-raised border-white/[0.08]' : 'bg-terminal-error/10 border-terminal-error/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-mpak-gray-900 capitalize">
                    {scanType.replace('_', ' ')}
                  </span>
                  {result.success ? (
                    <svg className="w-4 h-4 text-terminal-success" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-terminal-error" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="text-xs text-mpak-gray-500">
                  {result.scanner && <span>via {result.scanner}</span>}
                  {result.findings && result.findings.length > 0 && (
                    <span className="ml-2">{result.findings.length} findings</span>
                  )}
                  {result.error && (
                    <span className="text-terminal-error">{result.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* SBOM preview */}
          {securityScan.scans.sbom?.findings && securityScan.scans.sbom.findings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-mpak-gray-700 mb-2">
                Top Dependencies ({Math.min(10, securityScan.scans.sbom.findings.filter(f => f.purl).length)} of {securityScan.scans.sbom.findings.filter(f => f.purl).length})
              </h4>
              <div className="bg-surface rounded-lg border border-white/[0.08] divide-y divide-white/[0.08]">
                {securityScan.scans.sbom.findings
                  .filter(f => f.purl)
                  .slice(0, 10)
                  .map((finding, idx) => (
                    <div key={idx} className="px-3 py-2 flex items-center justify-between text-sm">
                      <span className="font-mono text-mpak-gray-700">{finding.name}</span>
                      <span className="text-mpak-gray-400">{finding.version}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
