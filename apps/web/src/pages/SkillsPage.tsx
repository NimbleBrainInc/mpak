import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, SkillSummary } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema, generateItemListSchema } from '../lib/schema';
import Breadcrumbs from '../components/Breadcrumbs';

// Category icons and labels - using workshop-cat-* dark-bg classes
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

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const skillCount = skills.length;
  const description = skillCount > 0
    ? `Browse ${skillCount}+ skills that teach your AI. Filter by category, search by name. Install with mpak skill install.`
    : 'Explore skills that give your AI expertise in code review, writing, strategy, and more. Install any skill instantly with mpak.';

  const schemas = [
    generateBreadcrumbSchema([
      { name: 'Home', url: 'https://www.mpak.dev/' },
      { name: 'Skills', url: 'https://www.mpak.dev/skills' },
    ]),
    ...(skills.length > 0
      ? [generateItemListSchema(
          skills.map((skill) => ({
            name: skill.name,
            url: `https://www.mpak.dev/skills/${skill.name}`,
          })),
          'Agent Skills',
        )]
      : []),
  ];

  useSEO({
    title: 'Browse Skills',
    description,
    canonical: 'https://www.mpak.dev/skills',
    keywords: [
      'agent skills',
      'ai skills',
      'skill registry',
      'ai expertise',
      'claude skills',
    ],
    schema: schemas,
  });

  useEffect(() => {
    loadSkills();
  }, []);

  // Cache skills for instant navigation
  useEffect(() => {
    if (skills.length > 0) {
      skills.forEach(skill => {
        queryClient.setQueryData(['skill', skill.name], skill);
      });
    }
  }, [skills, queryClient]);

  async function loadSkills() {
    try {
      setLoading(true);
      setError(null);
      const result = await api.searchSkills({
        limit: 100,
        sort: 'downloads',
      });
      setSkills(result.skills);
    } catch (err) {
      console.error('Failed to load skills:', err);
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  // Filter skills
  const filteredSkills = skills.filter((skill) => {
    if (category !== 'all' && skill.category !== category) {
      return false;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = skill.name.toLowerCase().includes(query);
      const matchesDescription = skill.description?.toLowerCase().includes(query);
      const matchesTags = skill.tags?.some(t => t.toLowerCase().includes(query));

      if (!matchesName && !matchesDescription && !matchesTags) {
        return false;
      }
    }

    return true;
  });

  // Get categories with counts
  const categoryCounts = skills.reduce((acc, skill) => {
    const cat = skill.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="animate-pulse">
          <div className="h-4 workshop-skeleton rounded w-48 mb-6"></div>
          <div className="h-8 workshop-skeleton rounded w-64 mb-4"></div>
          <div className="h-4 workshop-skeleton rounded w-96 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-surface-raised rounded-lg p-6 border border-white/[0.08]">
                <div className="h-6 workshop-skeleton rounded mb-3"></div>
                <div className="h-12 workshop-skeleton rounded mb-4"></div>
                <div className="h-8 workshop-skeleton rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-terminal-error/10 border border-terminal-error/20 rounded-lg p-6">
          <p className="text-terminal-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Breadcrumbs */}
      <div className="border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 [&>nav]:mb-0">
          <Breadcrumbs
            items={[
              { label: 'Explore', href: '/' },
              { label: 'Skills' },
            ]}
          />
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-accent-purple-glow rounded-lg flex items-center justify-center border border-accent-purple-border">
              <svg className="w-5 h-5 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-mpak-gray-900">Browse Skills</h1>
          </div>
          <p className="text-mpak-gray-600">
            Instructions that teach your AI new behaviors and expertise
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* Filters */}
      <div className="bg-surface-raised rounded-xl border border-white/[0.08] p-6 mb-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Search */}
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-mpak-gray-600 mb-2">
              Search
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="workshop-input workshop-input-purple w-full px-4 py-2.5 pl-10"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mpak-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex-1">
            <label htmlFor="category" className="block text-sm font-medium text-mpak-gray-600 mb-2">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="workshop-select workshop-select-purple w-full px-4 py-2.5"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORIES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label} {categoryCounts[key] ? `(${categoryCounts[key]})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Results count */}
          <div className="flex items-end">
            <div className="text-sm text-mpak-gray-500 pb-2.5">
              {filteredSkills.length} {filteredSkills.length === 1 ? 'skill' : 'skills'}
            </div>
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      {filteredSkills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSkills.map((skill) => {
            const catInfo = getCategoryInfo(skill.category);
            return (
              <Link
                key={skill.name}
                to={`/skills/${skill.name}`}
                className="workshop-card workshop-card-purple block p-5 flex flex-col"
              >
                {/* Name */}
                <h3 className="text-[1.05rem] font-semibold text-mpak-gray-900 leading-snug mb-1.5">
                  {skill.name.split('/')[1] || skill.name}
                </h3>

                {/* Scope */}
                <p className="text-[0.7rem] text-mpak-gray-400 font-mono mb-3">{skill.name}</p>

                {/* Description */}
                <p className="text-sm text-mpak-gray-600 leading-relaxed line-clamp-2 min-h-[2.5rem] mb-3">
                  {skill.description || 'No description'}
                </p>

                {/* Tags */}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {skill.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[0.65rem] text-mpak-gray-500 bg-surface px-1.5 py-0.5 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                    {skill.tags.length > 3 && (
                      <span className="text-[0.65rem] text-mpak-gray-400">+{skill.tags.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Footer: category + version + downloads */}
                <div className="mt-auto flex items-center gap-2 text-[0.7rem] text-mpak-gray-500 pt-3 border-t border-white/[0.06]">
                  <span className={`inline-flex items-center gap-1 ${catInfo.colorClass} !bg-transparent !border-0 p-0`}>
                    {catInfo.icon}
                    {catInfo.label}
                  </span>
                  <span className="text-mpak-gray-300/30">|</span>
                  <span>v{skill.latest_version}</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {skill.downloads.toLocaleString()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 workshop-card">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-purple-glow flex items-center justify-center">
            <svg className="w-8 h-8 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-mpak-gray-900 mb-2">No skills found</h3>
          <p className="text-mpak-gray-600">Try adjusting your filters or search query</p>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
