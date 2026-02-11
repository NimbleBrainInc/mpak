import { useState } from 'react';
import { API_URL, SITE_URL } from '../lib/siteConfig';

interface BadgeSectionProps {
  packageName: string;
  packageType?: 'bundle' | 'skill';
}

// Production URLs for the generated markdown (what users will copy)
const PROD_API_URL = 'https://registry.mpak.dev';

export default function BadgeSection({ packageName, packageType = 'bundle' }: BadgeSectionProps) {
  const [copied, setCopied] = useState(false);

  const isProd = import.meta.env.PROD;

  // API route differs by package type
  const apiRoute = packageType === 'skill' ? 'skills' : 'bundles';
  // Frontend route differs by package type
  const siteRoute = packageType === 'skill' ? 'skills' : 'packages';

  // For preview: use current API server
  const previewBadgeUrl = `${API_URL}/v1/${apiRoute}/${packageName}/badge.svg`;

  // For markdown snippet: always use production URLs so users get the right code
  const badgeUrl = `${isProd ? PROD_API_URL : API_URL}/v1/${apiRoute}/${packageName}/badge.svg`;
  const packageUrl = `${isProd ? SITE_URL : window.location.origin}/${siteRoute}/${packageName}`;

  const markdownCode = `[![mpak](${badgeUrl})](${packageUrl})`;

  async function copyToClipboard() {
    await navigator.clipboard.writeText(markdownCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Badge</h2>

      {/* Preview */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-xs text-mpak-gray-500 uppercase tracking-wider">Preview</span>
        <img
          src={previewBadgeUrl}
          alt="mpak badge"
          className="h-5"
        />
      </div>

      {/* Markdown code block */}
      <div className="bg-surface-raised border border-white/[0.08] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/[0.08]">
          <span className="text-xs text-mpak-gray-400 font-medium">Markdown</span>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded text-xs text-mpak-gray-400 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-terminal-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
        <div className="p-4 font-mono text-sm overflow-x-auto">
          <code className="text-terminal-success break-all">
            {markdownCode}
          </code>
        </div>
      </div>

      {/* HTML alternative */}
      <details className="text-xs mt-3">
        <summary className="text-mpak-gray-400 cursor-pointer hover:text-mpak-gray-600">
          Show HTML version
        </summary>
        <div className="mt-2 bg-surface-raised rounded p-2 font-mono text-mpak-gray-600 break-all">
          {`<a href="${packageUrl}"><img src="${badgeUrl}" alt="mpak"></a>`}
        </div>
      </details>
    </div>
  );
}
