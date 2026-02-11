import type { PackageSearchParams, Package, PackageDetail, UserProfile } from '../schemas/generated';
import type {
  SkillSearchParams,
  SkillSearchResponse,
  SkillDetail,
  SkillSummary,
} from '../schemas/generated/skill';
import { API_URL } from './siteConfig';

// Re-export for convenience
export type SearchParams = PackageSearchParams;
export type { Package, PackageDetail, UserProfile };
export type { SkillSearchParams, SkillSearchResponse, SkillDetail, SkillSummary };

/**
 * Converts a Package (from browse/search) to a PackageDetail for use as placeholder data.
 * This safely transforms the top-level claimable/claimed fields into the claiming object structure.
 */
export function packageToDetailPlaceholder(pkg: Package): PackageDetail {
  return {
    name: pkg.name,
    display_name: pkg.display_name,
    description: pkg.description,
    author: pkg.author,
    latest_version: pkg.latest_version,
    icon: pkg.icon,
    server_type: pkg.server_type,
    tools: pkg.tools,
    downloads: pkg.downloads,
    published_at: pkg.published_at,
    verified: pkg.verified,
    github: pkg.github,
    // Transform top-level claim fields to the claiming object structure
    claiming: {
      claimable: pkg.claimable ?? false,
      claimed: pkg.claimed ?? false,
      claimed_by: null,
      claimed_at: null,
      github_repo: null,
    },
    // Fields that don't exist on Package - will be populated when full detail loads
    homepage: null,
    license: null,
    versions: [],
  };
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      // Handle error.error being either a string or an object with a message property
      const errorMessage = typeof error.error === 'string'
        ? error.error
        : error.error?.message || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Convert package name (@scope/package) to URL path (/@scope/package)
  private packageNameToPath(name: string): string {
    // Package names are always scoped: @scope/package
    // No URL encoding needed - just return as-is with leading /
    if (!name.startsWith('@')) {
      throw new Error('Package name must be scoped (e.g., @scope/package)');
    }
    return `/${name}`;
  }

  async searchPackages(params: SearchParams = {}): Promise<{ packages: Package[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        query.append(key, String(value));
      }
    });

    const queryString = query.toString();
    return this.fetch(`/app/packages${queryString ? `?${queryString}` : ''}`);
  }

  async getPackage(name: string): Promise<PackageDetail> {
    return this.fetch(`/app/packages${this.packageNameToPath(name)}`);
  }

  getPackageDownloadUrl(name: string, version: string, platform?: { os: string; arch: string }): string {
    const base = `${this.baseUrl}/app/packages${this.packageNameToPath(name)}/versions/${version}/download`;
    if (platform) {
      return `${base}?os=${platform.os}&arch=${platform.arch}`;
    }
    return base;
  }

  async publishPackage(
    file: File,
    token: string
  ): Promise<{
    success: boolean;
    package: {
      name: string;
      version: string;
    };
    sha256: string;
    size: number;
    url: string;
  }> {
    const formData = new FormData();
    formData.append('bundle', file);

    const response = await fetch(
      `${this.baseUrl}/app/packages`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      // Handle error.error being either a string or an object with a message property
      const errorMessage = typeof error.error === 'string'
        ? error.error
        : error.error?.message || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async getMe(token: string): Promise<UserProfile> {
    return this.fetch('/app/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async getMyPackages(token: string, params: { limit?: number; offset?: number; sort?: string } = {}): Promise<{
    packages: Package[];
    total: number;
    pagination: {
      limit: number;
      offset: number;
      has_more: boolean;
    };
  }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        query.append(key, String(value));
      }
    });

    const queryString = query.toString();
    return this.fetch(`/app/packages/me${queryString ? `?${queryString}` : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async getClaimStatus(name: string, token?: string): Promise<{
    claimable: boolean;
    package_name?: string;
    github_repo?: string;
    reason?: string;
    instructions?: {
      steps: string[];
      mpak_json_example: string;
      verification_url: string | null;
    };
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return this.fetch(`/app/packages${this.packageNameToPath(name)}/claim-status`, {
      headers,
    });
  }

  async claimPackage(
    name: string,
    githubRepo: string,
    token: string
  ): Promise<{
    success: boolean;
    message: string;
    package: {
      name: string;
      claimed_by: string;
      claimed_at: string;
      github_repo: string;
    };
    verification: {
      mpak_json_url: string;
      verified_at: string;
    };
  }> {
    const response = await fetch(
      `${this.baseUrl}/app/packages${this.packageNameToPath(name)}/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ github_repo: githubRepo }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Claim failed' }));
      // Handle error.error being either a string or an object with a message property
      const errorMessage = typeof error.error === 'string'
        ? error.error
        : error.error?.message || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // =============================================================================
  // Skills API
  // =============================================================================

  async searchSkills(params: SkillSearchParams = {}): Promise<SkillSearchResponse> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        query.append(key, String(value));
      }
    });

    const queryString = query.toString();
    return this.fetch(`/v1/skills/search${queryString ? `?${queryString}` : ''}`);
  }

  async getSkill(name: string): Promise<SkillDetail> {
    // name is @scope/skill-name, convert to URL path
    if (!name.startsWith('@')) {
      throw new Error('Skill name must be scoped (e.g., @scope/skill-name)');
    }
    const [scope, skillName] = name.substring(1).split('/');
    return this.fetch(`/v1/skills/@${scope}/${skillName}`);
  }

  getSkillDownloadUrl(name: string, version?: string): string {
    if (!name.startsWith('@')) {
      throw new Error('Skill name must be scoped (e.g., @scope/skill-name)');
    }
    const [scope, skillName] = name.substring(1).split('/');
    if (version) {
      return `${this.baseUrl}/v1/skills/@${scope}/${skillName}/versions/${version}/download`;
    }
    return `${this.baseUrl}/v1/skills/@${scope}/${skillName}/download`;
  }
}

export const api = new ApiClient();
