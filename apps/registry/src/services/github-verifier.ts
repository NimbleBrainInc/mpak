/**
 * GitHub Verification Service
 *
 * Fetches and validates mpak.json files from GitHub repositories
 * to verify package ownership claims.
 */

import { validateMpakJson, type MpakJson } from '../schemas/mpak-schema.js';

export interface GitHubRepoStats {
  stars: number;
  forks: number;
  watchers: number;
  updatedAt: Date;
}

export interface GitHubVerificationResult {
  success: boolean;
  mpakJson?: MpakJson;
  error?: string;
  githubUrl?: string;
}

/**
 * Parse GitHub repository identifier
 */
export function parseGitHubRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, '').replace(/\/$/, '');

  if (cleaned.includes('github.com')) {
    const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match && match[1] && match[2]) {
      return { owner: match[1], repo: match[2] };
    }
  }

  const parts = cleaned.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }

  return null;
}

/**
 * Fetch mpak.json from GitHub repository
 */
export async function fetchMpakJsonFromGitHub(
  githubRepo: string
): Promise<GitHubVerificationResult> {
  const parsed = parseGitHubRepo(githubRepo);

  if (!parsed) {
    return {
      success: false,
      error: 'Invalid GitHub repository format. Use "owner/repo" or full GitHub URL.',
    };
  }

  const { owner, repo } = parsed;
  const branches = ['main', 'master'];

  for (const branch of branches) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/mpak.json?ref=${branch}`;

    try {
      const apiResponse = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'mpak-registry',
        },
      });

      if (apiResponse.ok) {
        const text = await apiResponse.text();

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch (_parseError) {
          return {
            success: false,
            error: 'mpak.json exists but contains invalid JSON',
            githubUrl: `https://github.com/${owner}/${repo}/blob/${branch}/mpak.json`,
          };
        }

        const validation = validateMpakJson(json);

        if (!validation.valid) {
          return {
            success: false,
            error: `Invalid mpak.json: ${validation.errors.join(', ')}`,
            githubUrl: `https://github.com/${owner}/${repo}/blob/${branch}/mpak.json`,
          };
        }

        return {
          success: true,
          mpakJson: validation.mpakJson,
          githubUrl: `https://github.com/${owner}/${repo}/blob/${branch}/mpak.json`,
        };
      }
    } catch (_error) {
      // API request failed, try raw.githubusercontent.com
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/mpak.json`;

    try {
      const response = await fetch(rawUrl);

      if (response.ok) {
        const text = await response.text();

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch (_parseError) {
          return {
            success: false,
            error: 'mpak.json exists but contains invalid JSON',
            githubUrl: rawUrl,
          };
        }

        const validation = validateMpakJson(json);

        if (!validation.valid) {
          return {
            success: false,
            error: `Invalid mpak.json: ${validation.errors.join(', ')}`,
            githubUrl: rawUrl,
          };
        }

        return {
          success: true,
          mpakJson: validation.mpakJson,
          githubUrl: rawUrl,
        };
      }
    } catch (_error) {
      continue;
    }
  }

  return {
    success: false,
    error: 'Could not find mpak.json in repository. Please add mpak.json to the root of your repository on the main or master branch.',
  };
}

/**
 * Verify that a user is listed as a maintainer in mpak.json
 */
export function verifyMaintainer(mpakJson: MpakJson, githubUsername: string): boolean {
  return mpakJson.maintainers.some(
    (maintainer) => maintainer.toLowerCase() === githubUsername.toLowerCase()
  );
}

/**
 * Verify that the package name in mpak.json matches the claimed package
 */
export function verifyPackageName(mpakJson: MpakJson, expectedPackageName: string): boolean {
  return mpakJson.name === expectedPackageName;
}

/**
 * Complete verification flow for package claiming
 */
export async function verifyPackageClaim(
  packageName: string,
  githubRepo: string,
  githubUsername: string
): Promise<{
  verified: boolean;
  error?: string;
  details?: {
    mpakJson: MpakJson;
    githubUrl: string;
  };
}> {
  const fetchResult = await fetchMpakJsonFromGitHub(githubRepo);

  if (!fetchResult.success || !fetchResult.mpakJson) {
    return {
      verified: false,
      error: fetchResult.error ?? 'Failed to fetch mpak.json',
    };
  }

  const { mpakJson, githubUrl } = fetchResult;

  if (!verifyPackageName(mpakJson, packageName)) {
    return {
      verified: false,
      error: `Package name mismatch. mpak.json specifies "${mpakJson.name}" but you are trying to claim "${packageName}". Please update the "name" field in mpak.json.`,
    };
  }

  if (!verifyMaintainer(mpakJson, githubUsername)) {
    return {
      verified: false,
      error: `GitHub username "${githubUsername}" is not listed as a maintainer in mpak.json. Please add your username to the "maintainers" array.`,
    };
  }

  return {
    verified: true,
    details: {
      mpakJson,
      githubUrl: githubUrl!,
    },
  };
}

/**
 * Fetch repository stats from GitHub API
 */
export async function fetchGitHubRepoStats(
  githubRepo: string
): Promise<GitHubRepoStats | null> {
  const parsed = parseGitHubRepo(githubRepo);

  if (!parsed) {
    return null;
  }

  const { owner, repo } = parsed;
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'mpak-registry',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as Record<string, unknown>;

    return {
      stars: (data['stargazers_count'] as number) ?? 0,
      forks: (data['forks_count'] as number) ?? 0,
      watchers: (data['watchers_count'] as number) ?? 0,
      updatedAt: new Date(),
    };
  } catch (_error) {
    return null;
  }
}
