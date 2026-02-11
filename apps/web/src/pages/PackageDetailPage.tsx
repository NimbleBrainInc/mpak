import { useEffect, useState, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { api, Package, packageToDetailPlaceholder } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import { generatePackageSchema, generateBreadcrumbSchema } from '../lib/schema';
import ClaimPackageModal from '../components/ClaimPackageModal';
import RuntimeIcon from '../components/RuntimeIcon';
import Breadcrumbs from '../components/Breadcrumbs';
import LostInTransit from '../components/LostInTransit';
import ScanTriggerButton from '../components/ScanTriggerButton';
import BadgeSection from '../components/BadgeSection';
import SecurityScorecard from '../components/SecurityScorecard';

// Platform detection
function detectPlatform(): { os: string; arch: string } {
  const userAgent = navigator.userAgent.toLowerCase();
  let os = 'any';
  let arch = 'any';

  if (userAgent.includes('mac')) os = 'darwin';
  else if (userAgent.includes('win')) os = 'win32';
  else if (userAgent.includes('linux')) os = 'linux';

  if (userAgent.includes('arm') || (os === 'darwin' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    arch = 'arm64';
  } else {
    arch = 'x64';
  }

  return { os, arch };
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format number with commas
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

// OS icons
const OSIcon = ({ os, className = 'w-4 h-4' }: { os: string; className?: string }) => {
  switch (os) {
    case 'darwin':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
      );
    case 'win32':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .09v6.81l-6-1.15V13zm17 .25V22l-10-1.91V13.1l10 .15z"/>
        </svg>
      );
    case 'linux':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.117-.468.32-.753.696-.93z"/>
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L5 8.09v7.82l7 3.94 7-3.94V8.09l-7-3.94z"/>
        </svg>
      );
  }
};

// Tabs
type TabId = 'overview' | 'tools' | 'install' | 'security' | 'versions';

export default function PackageDetailPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [showClaimSuccess, setShowClaimSuccess] = useState(false);
  const [showPublishSuccess, setShowPublishSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [configTab, setConfigTab] = useState<'claude-code' | 'claude-desktop'>('claude-code');
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Platform selection - default to linux/arm64 (common deployment target)
  const detectedPlatform = useMemo(() => detectPlatform(), []);
  const [selectedPlatform, setSelectedPlatform] = useState<{ os: string; arch: string }>({ os: 'linux', arch: 'arm64' });

  // Extract package name from URL path
  const fullName = location.pathname.replace('/packages/', '');

  // Get cached data from browse page (partial Package data)
  const cachedPackage = queryClient.getQueryData<Package>(['package', fullName]);

  // Fetch full package details with React Query
  const { data: pkg, isLoading, error, refetch } = useQuery({
    queryKey: ['package-detail', fullName],
    queryFn: () => api.getPackage(fullName),
    enabled: !!fullName,
    staleTime: 30000,
    placeholderData: cachedPackage ? packageToDetailPlaceholder(cachedPackage) : undefined,
  });

  // Dynamic SEO
  const seoTitle = pkg
    ? `${pkg.display_name || pkg.name} - MCP Server`
    : 'Loading Package';
  const seoDescription = pkg
    ? `${pkg.description || `${pkg.name} MCP server bundle`}. Install with mpak install ${pkg.name}. ${pkg.downloads.toLocaleString()} downloads, version ${pkg.latest_version}.`
    : 'Loading MCP server package details...';

  useSEO({
    title: seoTitle,
    description: seoDescription,
    canonical: `https://www.mpak.dev/packages/${fullName}`,
    keywords: pkg
      ? [pkg.name, 'mcp server', pkg.server_type, 'claude integration', 'model context protocol']
      : [],
    schema: pkg
      ? [
          generatePackageSchema(pkg),
          generateBreadcrumbSchema([
            { name: 'Home', url: 'https://www.mpak.dev/' },
            { name: 'Bundles', url: 'https://www.mpak.dev/bundles' },
            { name: pkg.display_name || pkg.name, url: `https://www.mpak.dev/packages/${pkg.name}` },
          ]),
        ]
      : undefined,
  });

  // Resolve which version to display (selected or latest)
  const activeVersion = selectedVersion ?? pkg?.latest_version ?? null;

  // Get version data for the active version
  const latestVersionData = useMemo(() => {
    if (!pkg?.versions?.length) return null;
    return pkg.versions.find(v => v.version === activeVersion) || pkg.versions[0];
  }, [pkg, activeVersion]);

  // Get available platforms from artifacts, sorted: linux first, then darwin, then universal
  const availablePlatforms = useMemo(() => {
    if (!latestVersionData?.artifacts?.length) return [];
    const osOrder: Record<string, number> = { linux: 0, darwin: 1, win32: 2, any: 3 };
    return latestVersionData.artifacts
      .map(a => ({
        os: a.os,
        arch: a.arch,
        size: a.size_bytes,
        downloads: a.downloads,
        digest: a.digest,
      }))
      .sort((a, b) => (osOrder[a.os] ?? 2) - (osOrder[b.os] ?? 2));
  }, [latestVersionData]);

  // Get selected artifact based on platform
  const selectedArtifact = useMemo(() => {
    if (!availablePlatforms.length) return null;
    let artifact = availablePlatforms.find(
      a => a.os === selectedPlatform.os && a.arch === selectedPlatform.arch
    );
    if (!artifact) {
      artifact = availablePlatforms.find(a => a.os === 'any' && a.arch === 'any');
    }
    return artifact || availablePlatforms[0];
  }, [availablePlatforms, selectedPlatform]);

  useEffect(() => {
    if (searchParams.get('claimed') === 'true') {
      setShowClaimSuccess(true);
      refetch();
      searchParams.delete('claimed');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => setShowClaimSuccess(false), 5000);
    }
  }, [searchParams, setSearchParams, refetch]);

  useEffect(() => {
    if (searchParams.get('published') === 'true') {
      setShowPublishSuccess(true);
      searchParams.delete('published');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => setShowPublishSuccess(false), 5000);
    }
  }, [searchParams, setSearchParams]);

  async function copyToClipboard(text: string, type: 'install' | 'config' | 'digest') {
    await navigator.clipboard.writeText(text);
    if (type === 'install') {
      setCopiedInstall(true);
      setTimeout(() => setCopiedInstall(false), 2000);
    } else if (type === 'config') {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } else {
      setCopiedDigest(true);
      setTimeout(() => setCopiedDigest(false), 2000);
    }
  }

  // Loading skeleton
  if (isLoading && !pkg) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="animate-pulse">
          <div className="h-4 bg-surface-overlay rounded w-48 mb-6"></div>
          <div className="flex gap-5 mb-6">
            <div className="w-[72px] h-[72px] bg-surface-overlay rounded-xl"></div>
            <div className="flex-1">
              <div className="h-7 bg-surface-overlay rounded w-64 mb-3"></div>
              <div className="h-4 bg-surface-overlay rounded w-96"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <LostInTransit
          title="Bundle not found"
          message="This bundle doesn't exist, was unpublished, or maybe it's still compiling."
          backLink="/bundles"
          backLabel="Back to bundles"
        />
      </div>
    );
  }

  const installCommand = `mpak install ${pkg.name}`;
  const configCommand = configTab === 'claude-code'
    ? `claude mcp add --transport stdio ${pkg.name.split('/').pop()} -- mpak run ${pkg.name}`
    : `// Add to claude_desktop_config.json\n"${pkg.name.split('/').pop()}": {\n  "command": "mpak",\n  "args": ["run", "${pkg.name}"]\n}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Success Alerts */}
      {(showPublishSuccess || showClaimSuccess) && (
        <div className="fixed top-20 right-4 z-50 animate-fade-in-up">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg flex items-start gap-3 max-w-sm">
            <div className="flex-shrink-0 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-green-900">
                {showPublishSuccess ? 'Package Published!' : 'Package Claimed!'}
              </h3>
              <p className="text-sm text-green-700 mt-1">
                {showPublishSuccess
                  ? 'Your package is now available for download.'
                  : 'You now own this package.'}
              </p>
            </div>
            <button
              onClick={() => {
                setShowPublishSuccess(false);
                setShowClaimSuccess(false);
              }}
              className="text-green-600 hover:text-green-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="bg-surface-raised border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 [&>nav]:mb-0">
          <Breadcrumbs
            items={[
              { label: 'Explore', href: '/' },
              { label: 'Bundles', href: '/bundles' },
              { label: pkg.name },
            ]}
          />
        </div>
      </div>

      {/* Package Header */}
      <div className="bg-surface-raised border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Package Icon */}
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] bg-gradient-to-br from-accent-gold-400 to-accent-gold-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <RuntimeIcon runtime={pkg.server_type} className="w-8 h-8 sm:w-9 sm:h-9 text-white" />
            </div>

            {/* Package Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 sm:gap-3 mb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-mpak-gray-900 tracking-tight">
                  {pkg.display_name || pkg.name}
                </h1>
                <span className="font-mono text-sm px-2.5 py-1 bg-surface-overlay text-mpak-gray-500 rounded">
                  v{pkg.latest_version}
                </span>
                {pkg.verified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-gold-400/15 text-accent-gold-400 rounded text-xs font-semibold uppercase tracking-wide">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    Verified
                  </span>
                )}
                <div className="flex items-center gap-4 text-sm text-mpak-gray-500">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-mpak-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {formatNumber(pkg.downloads)}
                  </span>
                  {pkg.github?.stars != null && (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      {formatNumber(pkg.github.stars)}
                    </span>
                  )}
                </div>
                <div className="sm:ml-auto">
                  <ScanTriggerButton packageName={pkg.name} version={pkg.latest_version} />
                </div>
              </div>

              {/* Package name if different from display name */}
              {pkg.display_name && pkg.display_name !== pkg.name && (
                <p className="font-mono text-sm text-mpak-gray-400 mb-2">{pkg.name}</p>
              )}

              <p className="text-mpak-gray-600 mb-3">{pkg.description || 'No description provided'}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-surface-overlay rounded text-sm font-medium text-mpak-gray-600">
                  {pkg.server_type}
                </span>
                {pkg.license && (
                  <span className="px-3 py-1 bg-surface-overlay rounded text-sm font-medium text-mpak-gray-600">
                    {pkg.license}
                  </span>
                )}
                {pkg.claiming?.claimable && (
                  <button
                    onClick={() => setIsClaimModalOpen(true)}
                    className="px-3 py-1 bg-accent-gold-400/10 text-accent-gold-400 rounded text-sm font-medium border border-accent-gold-400/25 hover:bg-accent-gold-400/15 transition-colors"
                  >
                    Claim this package
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Certification Banner */}
      {latestVersionData?.security_scan?.status === 'completed' && latestVersionData.security_scan.certification?.level != null && latestVersionData.security_scan.certification.level > 0 && (
        <div className="bg-surface-raised border-b border-white/[0.08]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                latestVersionData.security_scan.certification.level === 1
                  ? 'bg-terminal-info/10 border-terminal-info/25 hover:border-terminal-info/40'
                  : latestVersionData.security_scan.certification.level === 2
                  ? 'bg-accent-gold-400/10 border-accent-gold-400/25 hover:border-accent-gold-400/40'
                  : latestVersionData.security_scan.certification.level === 3
                  ? 'bg-accent-emerald/10 border-accent-emerald/25 hover:border-accent-emerald/40'
                  : 'bg-accent-gold-400/10 border-accent-gold-400/25 hover:border-accent-gold-400/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    latestVersionData.security_scan.certification.level === 1
                      ? 'bg-terminal-info'
                      : latestVersionData.security_scan.certification.level === 2
                      ? 'bg-accent-gold-400'
                      : latestVersionData.security_scan.certification.level === 3
                      ? 'bg-accent-emerald'
                      : 'bg-accent-gold-400'
                  }`}>
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${
                        latestVersionData.security_scan.certification.level === 1
                          ? 'text-terminal-info'
                          : latestVersionData.security_scan.certification.level === 2
                          ? 'text-accent-gold-400'
                          : latestVersionData.security_scan.certification.level === 3
                          ? 'text-accent-emerald'
                          : 'text-accent-gold-400'
                      }`}>
                        mpak Certified Level {latestVersionData.security_scan.certification.level}
                      </span>
                      <span className={`text-sm ${
                        latestVersionData.security_scan.certification.level === 1
                          ? 'text-accent-gold-400'
                          : latestVersionData.security_scan.certification.level === 2
                          ? 'text-accent-gold-400'
                          : latestVersionData.security_scan.certification.level === 3
                          ? 'text-accent-emerald'
                          : 'text-accent-gold-400'
                      }`}>
                        {latestVersionData.security_scan.certification.level_name}
                      </span>
                    </div>
                    <div className={`text-sm mt-0.5 ${
                      latestVersionData.security_scan.certification.level === 1
                        ? 'text-accent-gold-400'
                        : latestVersionData.security_scan.certification.level === 2
                        ? 'text-accent-gold-400'
                        : latestVersionData.security_scan.certification.level === 3
                        ? 'text-accent-emerald'
                        : 'text-accent-gold-400'
                    }`}>
                      {latestVersionData.security_scan.certification.controls_passed}/{latestVersionData.security_scan.certification.controls_total} controls passed
                      {latestVersionData.security_scan.scanned_at && (
                        <span className="opacity-75"> · Scanned {new Date(latestVersionData.security_scan.scanned_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-mpak-gray-500">
                  <span>View full report</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface-raised border-b border-white/[0.08] overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-0">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'overview'
                  ? 'text-accent-gold-400 border-accent-gold-400'
                  : 'text-mpak-gray-500 border-transparent hover:text-mpak-gray-700'
              }`}
            >
              Overview
            </button>
            {pkg.tools && pkg.tools.length > 0 && (
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                  activeTab === 'tools'
                    ? 'text-accent-gold-400 border-accent-gold-400'
                    : 'text-mpak-gray-500 border-transparent hover:text-mpak-gray-700'
                }`}
              >
                Tools
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-mpak-gray-500 font-medium">
                  {pkg.tools.length}
                </span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('install')}
              className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'install'
                  ? 'text-accent-gold-400 border-accent-gold-400'
                  : 'text-mpak-gray-500 border-transparent hover:text-mpak-gray-700'
              }`}
            >
              Install
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                activeTab === 'security'
                  ? 'text-accent-gold-400 border-accent-gold-400'
                  : 'text-mpak-gray-500 border-transparent hover:text-mpak-gray-700'
              }`}
            >
              Security
              {latestVersionData?.security_scan?.certification?.level != null && latestVersionData.security_scan.certification.level > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                  latestVersionData.security_scan.certification.level === 1
                    ? 'bg-terminal-info/15 text-accent-gold-500'
                    : latestVersionData.security_scan.certification.level === 2
                    ? 'bg-accent-gold-400/15 text-accent-gold-400'
                    : latestVersionData.security_scan.certification.level === 3
                    ? 'bg-accent-emerald/15 text-accent-emerald'
                    : 'bg-accent-gold-400/15 text-accent-gold-400'
                }`}>
                  L{latestVersionData.security_scan.certification.level}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'versions'
                  ? 'text-accent-gold-400 border-accent-gold-400'
                  : 'text-mpak-gray-500 border-transparent hover:text-mpak-gray-700'
              }`}
            >
              Versions
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8 md:gap-12">
          {/* Left Column - Content */}
          <div className="min-w-0">
            {activeTab === 'overview' && (
              <>
                {/* README */}
                {latestVersionData?.readme && (
                  <section className="mb-10">
                    <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">README</h2>
                    <MarkdownRenderer accent="gold" className="prose prose-sm prose-gray max-w-none">
                      {latestVersionData.readme}
                    </MarkdownRenderer>
                  </section>
                )}

              </>
            )}

            {activeTab === 'tools' && pkg.tools && pkg.tools.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-mpak-gray-900 mb-4">
                  Tools <span className="text-mpak-gray-500 font-normal">({pkg.tools.length})</span>
                </h2>
                <div className="space-y-3">
                  {pkg.tools.map((tool) => (
                    <div key={tool.name} className="p-4 bg-surface-raised border border-white/[0.08] rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-surface-overlay rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-mpak-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold text-mpak-gray-900">{tool.name}</div>
                          {tool.description && (
                            <div className="text-sm text-mpak-gray-500 mt-1">{tool.description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'install' && (
              <>
                {/* Installation */}
                <section className="mb-10">
                  <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Installation</h2>
                  <div className="bg-surface-raised border border-white/[0.08] rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/[0.08]">
                      <span className="text-xs text-mpak-gray-400 font-medium">Terminal</span>
                      <button
                        onClick={() => copyToClipboard(installCommand, 'install')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded text-xs text-mpak-gray-400 hover:text-white transition-colors"
                      >
                        {copiedInstall ? (
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
                    <div className="p-4 font-mono text-sm text-mpak-gray-600 overflow-x-auto">
                      <span className="text-mpak-gray-500 select-none">$ </span>
                      <span className="text-terminal-success">mpak</span>
                      <span className="text-terminal-info"> install</span>
                      <span> {pkg.name}</span>
                    </div>
                  </div>
                  {latestVersionData?.provenance && (
                    <details className="text-xs mt-3">
                      <summary className="text-mpak-gray-400 cursor-pointer hover:text-mpak-gray-600">
                        Show provenance
                      </summary>
                      <div className="mt-2 bg-surface-raised rounded p-3 space-y-2 text-sm">
                        {latestVersionData.provenance.publish_method && (
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${
                              latestVersionData.provenance.publish_method === 'oidc'
                                ? 'bg-terminal-info/15 text-accent-gold-500'
                                : 'bg-surface-overlay text-mpak-gray-700'
                            }`}>
                              {latestVersionData.provenance.publish_method.toUpperCase()}
                            </span>
                            <span className="text-mpak-gray-500">
                              {latestVersionData.provenance.publish_method === 'oidc'
                                ? 'Signed via GitHub OIDC'
                                : `Published via ${latestVersionData.provenance.publish_method}`}
                            </span>
                          </div>
                        )}
                        {latestVersionData.provenance.repository && (
                          <div className="flex items-center justify-between">
                            <span className="text-mpak-gray-500">Source</span>
                            <a
                              href={`https://github.com/${latestVersionData.provenance.repository}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent-gold-400 hover:text-accent-gold-500 font-mono"
                            >
                              {latestVersionData.provenance.repository}
                            </a>
                          </div>
                        )}
                        {latestVersionData.provenance.sha && (
                          <div className="flex items-center justify-between">
                            <span className="text-mpak-gray-500">Commit</span>
                            <code className="font-mono bg-surface-overlay px-1.5 py-0.5 rounded text-mpak-gray-700">
                              {latestVersionData.provenance.sha.slice(0, 7)}
                            </code>
                          </div>
                        )}
                        {selectedArtifact?.digest && (
                          <div className="flex items-center justify-between">
                            <span className="text-mpak-gray-500">Digest</span>
                            <code className="font-mono bg-surface-overlay px-1.5 py-0.5 rounded text-mpak-gray-700 max-w-[200px] truncate">
                              {selectedArtifact.digest}
                            </code>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </section>

                {/* Configuration */}
                <section className="mb-10">
                  <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Configuration</h2>
                  <div className="flex gap-1 mb-3">
                    <button
                      onClick={() => setConfigTab('claude-code')}
                      className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                        configTab === 'claude-code'
                          ? 'bg-surface-base text-white border-white/[0.16]'
                          : 'bg-surface-raised text-mpak-gray-600 border-white/[0.08] hover:border-white/[0.08]'
                      }`}
                    >
                      Claude Code
                    </button>
                    <button
                      onClick={() => setConfigTab('claude-desktop')}
                      className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                        configTab === 'claude-desktop'
                          ? 'bg-surface-base text-white border-white/[0.16]'
                          : 'bg-surface-raised text-mpak-gray-600 border-white/[0.08] hover:border-white/[0.08]'
                      }`}
                    >
                      Claude Desktop
                    </button>
                  </div>
                  <div className="bg-surface-raised border border-white/[0.08] rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/[0.08]">
                      <span className="text-xs text-mpak-gray-400 font-medium">
                        {configTab === 'claude-code' ? 'Terminal' : 'JSON'}
                      </span>
                      <button
                        onClick={() => copyToClipboard(configCommand, 'config')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded text-xs text-mpak-gray-400 hover:text-white transition-colors"
                      >
                        {copiedConfig ? (
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
                    <div className="p-4 font-mono text-sm text-mpak-gray-600 overflow-x-auto whitespace-pre">
                      {configTab === 'claude-code' ? (
                        <>
                          <span className="text-mpak-gray-500 select-none">$ </span>
                          <span className="text-terminal-success">claude</span>
                          <span className="text-terminal-info"> mcp add</span>
                          <span> --transport stdio {pkg.name.split('/').pop()} -- \</span>
                          {'\n    '}
                          <span className="text-terminal-success">mpak</span>
                          <span className="text-terminal-info"> run</span>
                          <span> {pkg.name}</span>
                        </>
                      ) : (
                        <span className="text-accent-gold-400">{configCommand}</span>
                      )}
                    </div>
                  </div>
                </section>

                {/* Badge */}
                <section className="mb-10">
                  <BadgeSection packageName={pkg.name} packageType="bundle" />
                </section>
              </>
            )}

            {activeTab === 'security' && (
              <>
                {!latestVersionData?.security_scan && (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-mpak-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <p className="text-mpak-gray-500">Security scan not yet available for v{pkg.latest_version}</p>
                  </div>
                )}

                {latestVersionData?.security_scan?.status === 'pending' || latestVersionData?.security_scan?.status === 'scanning' ? (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-accent-gold-400 font-medium">Security scan in progress...</p>
                    <p className="text-sm text-mpak-gray-500 mt-1">This usually takes a few minutes</p>
                  </div>
                ) : null}

                {latestVersionData?.security_scan?.status === 'failed' && (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-terminal-error/60 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-terminal-error font-medium">Security scan failed</p>
                    <p className="text-sm text-mpak-gray-500 mt-1">Unable to complete analysis</p>
                  </div>
                )}

                {latestVersionData?.security_scan?.status === 'completed' && (
                  <SecurityScorecard scan={latestVersionData.security_scan} />
                )}
              </>
            )}

            {activeTab === 'versions' && (
              <section>
                <h2 className="text-base font-semibold text-mpak-gray-900 mb-4">All Versions</h2>
                {pkg.versions && pkg.versions.length > 0 ? (
                  <div className="space-y-3">
                    {pkg.versions.map((version) => (
                      <div
                        key={version.version}
                        className={`p-4 rounded-lg border ${
                          version.version === pkg.latest_version
                            ? 'bg-accent-gold-400/10 border-accent-gold-400/25'
                            : 'bg-surface-raised border-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-mpak-gray-900">v{version.version}</span>
                            {version.prerelease && (
                              <span className="text-xs bg-accent-gold-400/15 text-accent-gold-400 px-2 py-0.5 rounded font-medium">pre-release</span>
                            )}
                            {version.version === pkg.latest_version && (
                              <span className="text-xs bg-accent-gold-400 text-mpak-dark px-2 py-0.5 rounded font-medium">latest</span>
                            )}
                          </div>
                          {version.release_url && (
                            <a
                              href={version.release_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-accent-gold-400 hover:text-accent-gold-500"
                            >
                              Release notes →
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-mpak-gray-500">
                          <span>{new Date(version.published_at).toLocaleDateString()}</span>
                          <span>{formatNumber(version.downloads)} downloads</span>
                        </div>
                        {version.artifacts && version.artifacts.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/[0.08]">
                            <div className="flex flex-wrap gap-2">
                              {version.artifacts.map((artifact) => (
                                <a
                                  key={`${artifact.os}-${artifact.arch}`}
                                  href={api.getPackageDownloadUrl(pkg.name, version.version, { os: artifact.os, arch: artifact.arch })}
                                  className="inline-flex items-center gap-1.5 text-xs bg-surface-raised border border-white/[0.08] text-mpak-gray-600 px-3 py-1.5 rounded hover:border-accent-gold-400/40 hover:bg-accent-gold-400/10 hover:text-accent-gold-400 transition-colors"
                                  download
                                >
                                  {artifact.os === 'any' ? 'Universal' : `${artifact.os}/${artifact.arch}`}
                                  <span className="text-mpak-gray-400">·</span>
                                  {formatBytes(artifact.size_bytes)}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-mpak-gray-500">No versions available.</p>
                )}
              </section>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <aside className="md:sticky md:top-24 h-fit space-y-4">
            <div className="bg-surface-raised border border-white/[0.08] rounded-lg p-5">
              <h3 className="text-[11px] font-semibold text-mpak-gray-400 uppercase tracking-wide mb-4">Version</h3>
              <select
                className="w-full px-3 py-2.5 bg-surface-raised border border-white/[0.08] rounded-md font-mono text-sm text-mpak-gray-900 mb-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-gold-400 focus:border-transparent"
                value={activeVersion ?? pkg.latest_version}
                onChange={(e) => setSelectedVersion(e.target.value)}
              >
                {pkg.versions?.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}{v.version === pkg.latest_version ? ' (latest)' : ''}
                  </option>
                ))}
              </select>

              {availablePlatforms.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-[11px] font-semibold text-mpak-gray-400 uppercase tracking-wide mb-3">Platform</h3>
                  <div className="flex flex-wrap gap-2">
                    {availablePlatforms.map((platform) => {
                      const isSelected = selectedPlatform.os === platform.os && selectedPlatform.arch === platform.arch;
                      const isDetected = detectedPlatform.os === platform.os && detectedPlatform.arch === platform.arch;
                      return (
                        <button
                          key={`${platform.os}-${platform.arch}`}
                          onClick={() => setSelectedPlatform({ os: platform.os, arch: platform.arch })}
                          className={`
                            inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                            ${isSelected
                              ? 'bg-accent-gold-400 text-mpak-dark shadow-sm'
                              : 'bg-surface-overlay text-mpak-gray-700 hover:bg-surface-overlay'
                            }
                          `}
                        >
                          <OSIcon os={platform.os} className="w-4 h-4" />
                          <span>
                            {platform.os === 'any' ? 'Universal' : `${platform.os}/${platform.arch}`}
                          </span>
                          {isDetected && !isSelected && (
                            <span className="text-xs text-mpak-gray-400">(detected)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-mpak-gray-500">Runtime</span>
                  <span className="font-medium text-mpak-gray-900 capitalize">{pkg.server_type}</span>
                </div>
                {pkg.license && (
                  <div className="flex justify-between">
                    <span className="text-mpak-gray-500">License</span>
                    <span className="font-medium text-mpak-gray-900">{pkg.license}</span>
                  </div>
                )}
                {selectedArtifact && (
                  <div className="flex justify-between">
                    <span className="text-mpak-gray-500">Size</span>
                    <span className="font-mono font-medium text-mpak-gray-900">{formatBytes(selectedArtifact.size)}</span>
                  </div>
                )}
                {selectedArtifact?.digest && (
                  <div className="flex justify-between items-center">
                    <span className="text-mpak-gray-500">Digest</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-mpak-gray-500 truncate max-w-[120px]">
                        {selectedArtifact.digest.slice(0, 16)}...
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedArtifact.digest, 'digest')}
                        className="p-1 text-mpak-gray-400 hover:text-mpak-gray-600 hover:bg-surface-overlay rounded transition-colors"
                      >
                        {copiedDigest ? (
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {latestVersionData && (
                  <div className="flex justify-between">
                    <span className="text-mpak-gray-500">Updated</span>
                    <span className="font-medium text-mpak-gray-900">
                      {new Date(latestVersionData.published_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4 mt-4 border-t border-white/[0.08]">
                {pkg.claiming?.github_repo && (
                  <a
                    href={`https://github.com/${pkg.claiming.github_repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-mpak-gray-500 hover:text-accent-gold-400 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                  </a>
                )}
                {pkg.homepage && (
                  <a
                    href={pkg.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-mpak-gray-500 hover:text-accent-gold-400 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Homepage
                  </a>
                )}
              </div>

            </div>

            <div className="bg-surface-raised border border-white/[0.08] rounded-lg p-5">
              <a
                href={api.getPackageDownloadUrl(pkg.name, pkg.latest_version, { os: 'any', arch: 'any' })}
                className="flex items-center justify-center gap-2 w-full py-3 bg-accent-gold-400 hover:bg-accent-gold-500 text-mpak-dark font-semibold rounded-lg transition-colors"
                download
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download v{pkg.latest_version}
              </a>
              {selectedArtifact && (
                <p className="text-center text-xs text-mpak-gray-400 mt-2">
                  {selectedArtifact.os === 'any' ? 'Universal bundle' : `${selectedArtifact.os}/${selectedArtifact.arch}`} · {formatBytes(selectedArtifact.size)}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
      </div>

      {/* Claim Package Modal */}
      <ClaimPackageModal
        packageName={fullName}
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
      />
    </div>
  );
}
