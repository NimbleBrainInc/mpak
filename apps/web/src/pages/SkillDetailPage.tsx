import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { api, SkillSummary } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema } from '../lib/schema';
import Breadcrumbs from '../components/Breadcrumbs';
import BadgeSection from '../components/BadgeSection';
import LostInTransit from '../components/LostInTransit';

// Category styling - uses workshop-cat-* dark-native classes from index.css
const CATEGORIES: Record<string, { icon: React.ReactNode; label: string; colorClass: string }> = {
  development: {
    label: 'Development',
    colorClass: 'workshop-cat-development',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  writing: {
    label: 'Writing',
    colorClass: 'workshop-cat-writing',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  research: {
    label: 'Research',
    colorClass: 'workshop-cat-research',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  consulting: {
    label: 'Consulting',
    colorClass: 'workshop-cat-consulting',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  data: {
    label: 'Data',
    colorClass: 'workshop-cat-data',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  design: {
    label: 'Design',
    colorClass: 'workshop-cat-design',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  operations: {
    label: 'Operations',
    colorClass: 'workshop-cat-operations',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  security: {
    label: 'Security',
    colorClass: 'workshop-cat-security',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  other: {
    label: 'Other',
    colorClass: 'workshop-cat-other',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
};

type CategoryInfo = { icon: React.ReactNode; label: string; colorClass: string };

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const DEFAULT_CATEGORY_INFO: CategoryInfo = CATEGORIES.other!;

function getCategoryInfo(category?: string | null): CategoryInfo {
  const key = (category || 'other') as keyof typeof CATEGORIES;
  const info = CATEGORIES[key];
  if (info) return info;
  return DEFAULT_CATEGORY_INFO;
}

type TabId = 'overview' | 'install' | 'triggers' | 'versions';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Install' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'versions', label: 'Versions' },
];

export default function SkillDetailPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [copiedCommand, setCopiedCommand] = useState(false);

  // Extract skill name from URL: /skills/@scope/name
  const fullName = location.pathname.replace('/skills/', '');

  // Get cached data from browse page
  const cachedSkill = queryClient.getQueryData<SkillSummary>(['skill', fullName]);

  // Fetch full skill details
  const { data: skill, isLoading, error } = useQuery({
    queryKey: ['skill-detail', fullName],
    queryFn: () => api.getSkill(fullName),
    enabled: !!fullName && fullName.startsWith('@'),
    staleTime: 30000,
    placeholderData: cachedSkill ? {
      ...cachedSkill,
      license: undefined,
      compatibility: undefined,
      allowed_tools: undefined,
      triggers: undefined,
      examples: undefined,
      versions: [],
    } : undefined,
  });

  // SEO
  const displayName = skill?.name?.split('/')[1] || skill?.name || 'Loading';
  const seoTitle = skill
    ? `${displayName} - Agent Skill`
    : 'Loading Skill';
  const seoDescription = skill
    ? `${skill.description || `${displayName} Agent Skill`}. Install with mpak skill install ${skill.name}.`
    : 'Loading Agent Skill details...';

  useSEO({
    title: seoTitle,
    description: seoDescription,
    canonical: `https://www.mpak.dev/skills/${fullName}`,
    keywords: skill
      ? [skill.name, 'agent skill', 'claude skill', ...(skill.tags || [])]
      : [],
    schema: skill
      ? generateBreadcrumbSchema([
          { name: 'Home', url: 'https://www.mpak.dev/' },
          { name: 'Skills', url: 'https://www.mpak.dev/skills' },
          { name: displayName, url: `https://www.mpak.dev/skills/${skill.name}` },
        ])
      : undefined,
  });

  const installCommand = skill ? `mpak skill install ${skill.name}` : '';

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  }

  const catInfo = useMemo(() => getCategoryInfo(skill?.category), [skill?.category]);

  // Loading skeleton
  if (isLoading && !skill) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="animate-pulse">
          <div className="h-4 bg-surface-overlay rounded w-48 mb-6"></div>
          <div className="flex gap-5 mb-6">
            <div className="w-16 h-16 bg-surface-overlay rounded-xl"></div>
            <div className="flex-1">
              <div className="h-7 bg-surface-overlay rounded w-64 mb-3"></div>
              <div className="h-4 bg-surface-overlay rounded w-96"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !skill) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <LostInTransit
          title="Skill not found"
          message="This skill doesn't exist, was unpublished, or maybe it's still being written."
          backLink="/skills"
          backLabel="Back to skills"
        />
      </div>
    );
  }

  const hasContent = !!skill.content;
  const hasTags = skill.tags && skill.tags.length > 0;
  const hasCompatibility = !!skill.compatibility;
  const hasAllowedTools = skill.allowed_tools && skill.allowed_tools.length > 0;
  const hasExamples = skill.examples && skill.examples.length > 0;
  const hasOverviewContent = hasContent || hasTags || hasCompatibility || hasAllowedTools || hasExamples;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Breadcrumbs */}
      <div className="bg-surface-raised border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 [&>nav]:mb-0">
          <Breadcrumbs
            items={[
              { label: 'Explore', href: '/' },
              { label: 'Skills', href: '/skills' },
              { label: displayName },
            ]}
          />
        </div>
      </div>

      {/* Header Section */}
      <div className="bg-surface-raised border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Skill Icon */}
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] bg-gradient-to-br from-accent-purple-400 to-accent-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>

            {/* Skill Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 sm:gap-3 mb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-mpak-gray-900 tracking-tight">
                  {displayName}
                </h1>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded uppercase tracking-wide border ${catInfo.colorClass}`}>
                  {catInfo.icon}
                  {catInfo.label}
                </span>
                <div className="flex items-center gap-4 text-sm text-mpak-gray-500">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-mpak-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {skill.downloads.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Full name */}
              <p className="font-mono text-sm text-mpak-gray-400 mb-2">{skill.name}</p>

              <p className="text-mpak-gray-600 mb-3">{skill.description || 'No description provided'}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {skill.license && (
                  <span className="px-3 py-1 bg-surface-overlay rounded text-sm font-medium text-mpak-gray-600">
                    {skill.license}
                  </span>
                )}
                {skill.author?.name && (
                  <span className="px-3 py-1 bg-surface-overlay rounded text-sm font-medium text-mpak-gray-600">
                    by {skill.author.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-surface-raised border-b border-white/[0.08] overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'text-accent-purple-400 border-accent-purple-400'
                    : 'text-mpak-gray-500 border-transparent hover:text-mpak-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8 md:gap-12">
            {/* Left Column - Content */}
            <div className="min-w-0">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  {!hasOverviewContent && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-purple-500/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-mpak-gray-900 mb-2">No additional details</h3>
                      <p className="text-mpak-gray-500 max-w-md mx-auto">
                        This skill doesn't have additional metadata like tags, compatibility info, or example prompts.
                        Check the Triggers tab to see how to activate it.
                      </p>
                    </div>
                  )}

                  {/* Skill Content (body of SKILL.md) */}
                  {hasContent && (
                    <section className="mb-10">
                      <MarkdownRenderer accent="purple">
                        {skill.content!}
                      </MarkdownRenderer>
                    </section>
                  )}

                  {/* Tags */}
                  {hasTags && (
                    <section className="mb-10">
                      <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Tags</h2>
                      <div className="flex flex-wrap gap-2">
                        {skill.tags!.map((tag) => (
                          <span
                            key={tag}
                            className="text-sm text-mpak-gray-600 bg-surface-overlay px-3 py-1.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Compatibility */}
                  {hasCompatibility && (
                    <section className="mb-10">
                      <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Compatibility</h2>
                      <p className="text-mpak-gray-600">{skill.compatibility}</p>
                    </section>
                  )}

                  {/* Allowed Tools */}
                  {hasAllowedTools && (
                    <section className="mb-10">
                      <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Allowed Tools</h2>
                      <div className="flex flex-wrap gap-2">
                        {skill.allowed_tools!.map((tool) => (
                          <code
                            key={tool}
                            className="text-sm font-mono text-accent-purple-400 bg-accent-purple-500/10 px-2.5 py-1 rounded border border-accent-purple-500/25"
                          >
                            {tool}
                          </code>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Examples */}
                  {hasExamples && (
                    <section className="mb-10">
                      <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Example Prompts</h2>
                      <div className="space-y-3">
                        {skill.examples!.map((example, idx) => (
                          <div key={idx} className="bg-surface-raised rounded-lg p-4 border border-white/[0.08]">
                            <p className="text-mpak-gray-900 font-medium mb-1">"{example.prompt}"</p>
                            {example.context && (
                              <p className="text-sm text-mpak-gray-500 italic">{example.context}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* Install Tab */}
              {activeTab === 'install' && (
                <>
                  {/* Installation Command */}
                  <section className="mb-10">
                    <h2 className="text-base font-semibold text-mpak-gray-900 mb-3">Installation</h2>
                    <div className="bg-surface-raised border border-white/[0.08] rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/[0.08]">
                        <span className="text-xs text-mpak-gray-400 font-medium">Terminal</span>
                        <button
                          onClick={() => copyToClipboard(installCommand)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded text-xs text-mpak-gray-400 hover:text-white transition-colors"
                        >
                          {copiedCommand ? (
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
                        <span className="text-mpak-gray-500 select-none">$ </span>
                        <span className="text-terminal-success">mpak</span>
                        <span className="text-terminal-info"> skill install</span>
                        <span className="text-mpak-gray-800"> {skill.name}</span>
                      </div>
                    </div>
                    {skill.provenance && (
                      <details className="text-xs mt-3">
                        <summary className="text-mpak-gray-400 cursor-pointer hover:text-mpak-gray-600">
                          Show provenance
                        </summary>
                        <div className="mt-2 bg-surface-raised rounded p-3 space-y-2 text-sm">
                          {skill.provenance.publish_method && (
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${
                                skill.provenance.publish_method === 'oidc'
                                  ? 'bg-terminal-info/15 text-accent-purple-500'
                                  : 'bg-surface-overlay text-mpak-gray-700'
                              }`}>
                                {skill.provenance.publish_method.toUpperCase()}
                              </span>
                              <span className="text-mpak-gray-500">
                                {skill.provenance.publish_method === 'oidc'
                                  ? 'Signed via GitHub OIDC'
                                  : `Published via ${skill.provenance.publish_method}`}
                              </span>
                            </div>
                          )}
                          {skill.provenance.repository && (
                            <div className="flex items-center justify-between">
                              <span className="text-mpak-gray-500">Source</span>
                              <a
                                href={`https://github.com/${skill.provenance.repository}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent-purple-400 hover:text-accent-purple-500 font-mono"
                              >
                                {skill.provenance.repository}
                              </a>
                            </div>
                          )}
                          {skill.provenance.sha && (
                            <div className="flex items-center justify-between">
                              <span className="text-mpak-gray-500">Commit</span>
                              <code className="font-mono bg-surface-overlay px-1.5 py-0.5 rounded text-mpak-gray-700">
                                {skill.provenance.sha.slice(0, 7)}
                              </code>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </section>

                  {/* Badge */}
                  <section>
                    <BadgeSection packageName={skill.name} packageType="skill" />
                  </section>
                </>
              )}

              {/* Triggers Tab */}
              {activeTab === 'triggers' && (
                <>
                  {skill.triggers && skill.triggers.length > 0 ? (
                    <section>
                      <p className="text-mpak-gray-600 mb-4">
                        These phrases can activate this skill when mentioned to Claude:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {skill.triggers.map((trigger, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-accent-purple-500/10 rounded-lg border border-accent-purple-500/25"
                          >
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-purple-500 text-white flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </div>
                            <span className="text-mpak-gray-700">"{trigger}"</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-purple-500/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-mpak-gray-900 mb-2">No trigger phrases</h3>
                      <p className="text-mpak-gray-500 max-w-md mx-auto">
                        This skill can be activated by invoking it directly with the Skill tool or by using keywords in your prompt that match its description.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Versions Tab */}
              {activeTab === 'versions' && (
                <section>
                  <h2 className="text-base font-semibold text-mpak-gray-900 mb-4">All Versions</h2>
                  {skill.versions && skill.versions.length > 0 ? (
                    <div className="space-y-3">
                      {skill.versions.map((version) => (
                        <div
                          key={version.version}
                          className={`p-4 rounded-lg border ${
                            version.version === skill.latest_version
                              ? 'bg-accent-purple-500/10 border-accent-purple-500/25'
                              : 'bg-surface-raised border-white/[0.08]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-mpak-gray-900">v{version.version}</span>
                              {version.version === skill.latest_version && (
                                <span className="text-xs bg-accent-purple-500 text-white px-2 py-0.5 rounded font-medium">latest</span>
                              )}
                            </div>
                            <a
                              href={api.getSkillDownloadUrl(skill.name, version.version)}
                              className="text-sm text-accent-purple-400 hover:text-accent-purple-500"
                              download
                            >
                              Download →
                            </a>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-mpak-gray-500">
                            <span>{new Date(version.published_at).toLocaleDateString()}</span>
                            <span>{version.downloads.toLocaleString()} downloads</span>
                          </div>
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
              {/* Version & Metadata Card */}
              <div className="bg-surface-raised border border-white/[0.08] rounded-lg p-5">
                <h3 className="text-[11px] font-semibold text-mpak-gray-400 uppercase tracking-wide mb-4">Version</h3>

                {/* Version Selector */}
                <select
                  className="w-full px-3 py-2.5 bg-surface-raised border border-white/[0.08] rounded-md font-mono text-sm text-mpak-gray-900 mb-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-purple-500 focus:border-transparent"
                  value={skill.latest_version}
                  onChange={() => {/* Version switching could be implemented */}}
                >
                  {skill.versions?.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version}{v.version === skill.latest_version ? ' (latest)' : ''}
                    </option>
                  ))}
                </select>

                {/* Metadata List */}
                <div className="space-y-3 text-sm">
                  {skill.license && (
                    <div className="flex justify-between">
                      <span className="text-mpak-gray-500">License</span>
                      <span className="font-medium text-mpak-gray-900">{skill.license}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-mpak-gray-500">Category</span>
                    <span className="font-medium text-mpak-gray-900 capitalize">{skill.category || 'Other'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mpak-gray-500">Downloads</span>
                    <span className="font-medium text-mpak-gray-900">{skill.downloads.toLocaleString()}</span>
                  </div>
                </div>

                {/* Links */}
                {skill.author?.url && (
                  <div className="flex gap-4 pt-4 mt-4 border-t border-white/[0.08]">
                    <a
                      href={skill.author.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-mpak-gray-500 hover:text-accent-purple-400 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Author
                    </a>
                  </div>
                )}
              </div>

              {/* Download Card */}
              <div className="bg-surface-raised border border-white/[0.08] rounded-lg p-5">
                <a
                  href={api.getSkillDownloadUrl(skill.name)}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-accent-purple-500 hover:bg-accent-purple-600 text-white font-semibold rounded-lg transition-colors"
                  download
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download v{skill.latest_version}
                </a>
              </div>

            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
