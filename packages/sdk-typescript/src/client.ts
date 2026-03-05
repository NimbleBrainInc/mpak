import { createHash } from 'crypto';
import type {
  MpakClientConfig,
  BundleSearchParams,
  BundleDetailResponse,
  BundleVersionsResponse,
  BundleVersionResponse,
  BundleDownloadResponse,
  SkillDetailResponse,
  SkillDownloadResponse,
  SkillSearchParams,
  Platform,
  // TODO: remove once approved
  // SkillReference,
  // GithubSkillReference,
  // UrlSkillReference,
  // ResolvedSkill,
} from './types.js';
import type { BundleSearchResponse, SkillSearchResponse } from '@nimblebrain/mpak-schemas';
import { MpakNotFoundError, MpakIntegrityError, MpakNetworkError } from './errors.js';

const DEFAULT_REGISTRY_URL = 'https://registry.mpak.dev';
const DEFAULT_TIMEOUT = 30000;

/**
 * Client for interacting with the mpak registry
 *
 * Requires Node.js 18+ for native fetch support.
 */
export class MpakClient {
  private readonly registryUrl: string;
  private readonly timeout: number;
  private readonly userAgent: string | undefined;

  constructor(config: MpakClientConfig = {}) {
    this.registryUrl = config.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.userAgent = config.userAgent;
  }

  // ===========================================================================
  // Bundle API
  // ===========================================================================

  /**
   * Search for bundles
   */
  async searchBundles(params: BundleSearchParams = {}): Promise<BundleSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.type) searchParams.set('type', params.type);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));

    const queryString = searchParams.toString();
    const url = `${this.registryUrl}/v1/bundles/search${queryString ? `?${queryString}` : ''}`;

    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MpakNotFoundError('bundles/search endpoint');
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to search bundles: HTTP ${response.status}`);
    }

    return response.json() as Promise<BundleSearchResponse>;
  }

  /**
   * Get bundle details
   */
  async getBundle(name: string): Promise<BundleDetailResponse> {
    this.validateScopedName(name);

    const url = `${this.registryUrl}/v1/bundles/${name}`;
    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MpakNotFoundError(name);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get bundle: HTTP ${response.status}`);
    }

    return response.json() as Promise<BundleDetailResponse>;
  }

  /**
   * Get all versions of a bundle
   */
  async getBundleVersions(name: string): Promise<BundleVersionsResponse> {
    this.validateScopedName(name);

    const url = `${this.registryUrl}/v1/bundles/${name}/versions`;
    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MpakNotFoundError(name);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get bundle versions: HTTP ${response.status}`);
    }

    return response.json() as Promise<BundleVersionsResponse>;
  }

  /**
   * Get a specific version of a bundle
   */
  async getBundleVersion(name: string, version: string): Promise<BundleVersionResponse> {
    this.validateScopedName(name);

    const url = `${this.registryUrl}/v1/bundles/${name}/versions/${version}`;
    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MpakNotFoundError(`${name}@${version}`);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get bundle version: HTTP ${response.status}`);
    }

    return response.json() as Promise<BundleVersionResponse>;
  }

  /**
   * Get download info for a bundle
   */
  async getBundleDownload(
    name: string,
    version: string,
    platform?: Platform,
  ): Promise<BundleDownloadResponse> {
    this.validateScopedName(name);

    const params = new URLSearchParams();
    if (platform) {
      params.set('os', platform.os);
      params.set('arch', platform.arch);
    }

    const queryString = params.toString();
    const url = `${this.registryUrl}/v1/bundles/${name}/versions/${version}/download${queryString ? `?${queryString}` : ''}`;

    const response = await this.fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 404) {
      throw new MpakNotFoundError(`${name}@${version}`);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get bundle download: HTTP ${response.status}`);
    }

    return response.json() as Promise<BundleDownloadResponse>;
  }

  // ===========================================================================
  // Skill API
  // ===========================================================================

  /**
   * Search for skills
   */
  async searchSkills(params: SkillSearchParams = {}): Promise<SkillSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.tags) searchParams.set('tags', params.tags);
    if (params.category) searchParams.set('category', params.category);
    if (params.surface) searchParams.set('surface', params.surface);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));

    const queryString = searchParams.toString();
    const url = `${this.registryUrl}/v1/skills/search${queryString ? `?${queryString}` : ''}`;

    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MpakNotFoundError('skills/search endpoint');
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to search skills: HTTP ${response.status}`);
    }

    return response.json() as Promise<SkillSearchResponse>;
  }

  /**
   * Get skill details
   */
  async getSkill(name: string): Promise<SkillDetailResponse> {
    this.validateScopedName(name);

    const url = `${this.registryUrl}/v1/skills/${name}`;
    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MpakNotFoundError(name);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get skill: HTTP ${response.status}`);
    }

    return response.json() as Promise<SkillDetailResponse>;
  }

	// TODO: The next 2 functions `getSkillDownload` and `getSkillVersionDownload` should be merged into 1, making the skill download functionality consistent with bundle download function. We can not do it right now because both of these functions are used by CLI.
	// In future, the single merged function should mirror `getBundleDownload`

  /**
   * Get download info for a skill (latest version)
   */
  async getSkillDownload(name: string): Promise<SkillDownloadResponse> {
    this.validateScopedName(name);

    const url = `${this.registryUrl}/v1/skills/${name}/download`;

    const response = await this.fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 404) {
      throw new MpakNotFoundError(name);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get skill download: HTTP ${response.status}`);
    }

    return response.json() as Promise<SkillDownloadResponse>;
  }

  /**
   * Get download info for a specific skill version
   */
  async getSkillVersionDownload(name: string, version: string): Promise<SkillDownloadResponse> {
    this.validateScopedName(name);

    const url = `${this.registryUrl}/v1/skills/${name}/versions/${version}/download`;

    const response = await this.fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 404) {
      throw new MpakNotFoundError(`${name}@${version}`);
    }

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to get skill download: HTTP ${response.status}`);
    }

    return response.json() as Promise<SkillDownloadResponse>;
  }

  // TODO: remove once approved — replaced by downloadContent + downloadSkillBundle
  // async downloadSkillContent(
  //   downloadUrl: string,
  //   expectedSha256?: string,
  // ): Promise<{ content: string; verified: boolean }> { ... }

  // TODO: remove once approved — resolveSkillRef and all supporting methods
  // are not used by the CLI or any external consumer
  // async resolveSkillRef(ref: SkillReference): Promise<ResolvedSkill> { ... }
  // private async resolveMpakSkill(ref: SkillReference & { source: 'mpak' }): Promise<ResolvedSkill> { ... }
  // private async resolveGithubSkill(ref: GithubSkillReference): Promise<ResolvedSkill> { ... }
  // private async resolveUrlSkill(ref: UrlSkillReference): Promise<ResolvedSkill> { ... }
  // private async extractSkillFromZip(zipBuffer: ArrayBuffer, skillName: string): Promise<string> { ... }
  // private verifyIntegrityOrThrow(content: string, integrity: string): void { ... }
  // private extractHash(integrity: string): string { ... }

  // ===========================================================================
  // Download Methods
  // ===========================================================================

  /**
   * Download content from a URL and verify its SHA-256 integrity.
   *
   * @throws {MpakIntegrityError} If SHA-256 doesn't match
   * @throws {MpakNetworkError} For network failures
   */
  async downloadContent(url: string, sha256: string): Promise<Buffer> {
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      throw new MpakNetworkError(`Failed to download: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const actualHash = this.computeSha256(buffer);
    if (actualHash !== sha256) {
      throw new MpakIntegrityError(sha256, actualHash);
    }

    return buffer;
  }

  /**
   * Download a bundle by name, with optional version and platform.
   * Defaults to latest version and auto-detected platform.
   *
   * @throws {MpakNotFoundError} If bundle not found
   * @throws {MpakIntegrityError} If SHA-256 doesn't match
   * @throws {MpakNetworkError} For network failures
   */
  async downloadBundle(
    name: string,
    version?: string,
    platform?: Platform,
  ): Promise<{ bundleRaw: Buffer; bundleMetadata: BundleDownloadResponse['bundle'] }> {
    const resolvedPlatform = platform ?? MpakClient.detectPlatform();
    const resolvedVersion = version ?? 'latest';

    const downloadInfo = await this.getBundleDownload(name, resolvedVersion, resolvedPlatform);
    const bundleRaw = await this.downloadContent(downloadInfo.url, downloadInfo.bundle.sha256);

    return { bundleRaw, bundleMetadata: downloadInfo.bundle };
  }

  /**
   * Download a skill bundle by name, with optional version.
   * Defaults to latest version.
   *
   * @throws {MpakNotFoundError} If skill not found
   * @throws {MpakIntegrityError} If SHA-256 doesn't match
   * @throws {MpakNetworkError} For network failures
   */
  async downloadSkillBundle(
    name: string,
    version?: string,
  ): Promise<{ skillRaw: Buffer; skillMetadata: SkillDownloadResponse['skill'] }> {
    const resolvedVersion = version ?? 'latest';

    const downloadInfo = await this.getSkillVersionDownload(name, resolvedVersion);
    const skillRaw = await this.downloadContent(downloadInfo.url, downloadInfo.skill.sha256);

    return { skillRaw, skillMetadata: downloadInfo.skill };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Detect the current platform
   */
  static detectPlatform(): Platform {
    const nodePlatform = process.platform;
    const nodeArch = process.arch;

    let os: string;
    switch (nodePlatform) {
      case 'darwin':
        os = 'darwin';
        break;
      case 'win32':
        os = 'win32';
        break;
      case 'linux':
        os = 'linux';
        break;
      default:
        os = 'any';
    }

    let arch: string;
    switch (nodeArch) {
      case 'x64':
        arch = 'x64';
        break;
      case 'arm64':
        arch = 'arm64';
        break;
      default:
        arch = 'any';
    }

    return { os, arch };
  }

  /**
   * Compute SHA256 hash of content
   */
  private computeSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate that a name is scoped (@scope/name)
   */
  private validateScopedName(name: string): void {
    if (!name.startsWith('@')) {
      throw new Error('Package name must be scoped (e.g., @scope/package-name)');
    }
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeout);

    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
    };
    if (this.userAgent) {
      headers['User-Agent'] = this.userAgent;
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MpakNetworkError(`Request timeout after ${this.timeout}ms`);
      }
      throw new MpakNetworkError(error instanceof Error ? error.message : 'Network error');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
