import { valid as isValidSemver } from 'semver';
import type { MCPBManifest } from '../types.js';

export interface ValidationError {
  field: string;
  message: string;
}

export class ManifestValidator {
  private errors: ValidationError[] = [];

  validate(manifest: unknown): manifest is MCPBManifest {
    this.errors = [];

    if (!manifest || typeof manifest !== 'object') {
      this.errors.push({ field: 'manifest', message: 'Manifest must be an object' });
      return false;
    }

    const m = manifest as Record<string, unknown>;

    this.validateName(m['name']);
    this.validateVersion(m['version']);

    let serverType: string | undefined;
    if (m['server'] && typeof m['server'] === 'object') {
      const server = m['server'] as Record<string, unknown>;
      serverType = server['type'] as string;
    } else if (m['server_type']) {
      serverType = m['server_type'] as string;
    }
    this.validateServerType(serverType);

    if (m['display_name'] !== undefined) {
      this.validateString(m['display_name'], 'display_name', 255);
    }

    if (m['description'] !== undefined) {
      this.validateString(m['description'], 'description', 5000);
    }

    if (m['author'] !== undefined) {
      this.validateAuthor(m['author']);
    }

    if (m['homepage'] !== undefined) {
      this.validateUrl(m['homepage'], 'homepage');
    }

    if (m['license'] !== undefined) {
      this.validateString(m['license'], 'license', 100);
    }

    if (m['icon'] !== undefined) {
      this.validateString(m['icon'], 'icon', 512);
    }

    if (m['platforms'] !== undefined) {
      this.validatePlatforms(m['platforms']);
    }

    if (m['tools'] !== undefined) {
      this.validateArray(m['tools'], 'tools', this.validateTool.bind(this));
    }

    if (m['prompts'] !== undefined) {
      this.validateArray(m['prompts'], 'prompts', this.validatePrompt.bind(this));
    }

    if (m['resources'] !== undefined) {
      this.validateArray(m['resources'], 'resources', this.validateResource.bind(this));
    }

    return this.errors.length === 0;
  }

  getErrors(): ValidationError[] {
    return this.errors;
  }

  private validateName(value: unknown): void {
    if (typeof value !== 'string' || !value) {
      this.errors.push({ field: 'name', message: 'Name is required and must be a string' });
      return;
    }

    const scopedRegex = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,213}$/;

    if (!scopedRegex.test(value)) {
      this.errors.push({
        field: 'name',
        message: 'Package name must be scoped (e.g., @username/package-name). Unscoped packages are not allowed.',
      });
    }

    if (value.length > 255) {
      this.errors.push({ field: 'name', message: 'Name must be 255 characters or less' });
    }
  }

  private validateVersion(value: unknown): void {
    if (typeof value !== 'string' || !value) {
      this.errors.push({ field: 'version', message: 'Version is required and must be a string' });
      return;
    }

    if (!isValidSemver(value)) {
      this.errors.push({ field: 'version', message: 'Version must be valid semver (e.g., 1.0.0)' });
    }
  }

  private validateServerType(value: unknown): void {
    if (typeof value !== 'string') {
      this.errors.push({ field: 'server_type', message: 'Server type is required and must be a string' });
      return;
    }

    const validTypes = ['node', 'python', 'binary'];
    if (!validTypes.includes(value)) {
      this.errors.push({
        field: 'server_type',
        message: `Server type must be one of: ${validTypes.join(', ')}`,
      });
    }
  }

  private validateString(value: unknown, field: string, maxLength: number): void {
    if (typeof value !== 'string') {
      this.errors.push({ field, message: `${field} must be a string` });
      return;
    }

    if (value.length > maxLength) {
      this.errors.push({ field, message: `${field} must be ${maxLength} characters or less` });
    }
  }

  private validateUrl(value: unknown, field: string): void {
    if (typeof value !== 'string') {
      this.errors.push({ field, message: `${field} must be a string` });
      return;
    }

    try {
      new URL(value);
    } catch {
      this.errors.push({ field, message: `${field} must be a valid URL` });
    }
  }

  private validateAuthor(value: unknown): void {
    if (!value || typeof value !== 'object') {
      this.errors.push({ field: 'author', message: 'Author must be an object' });
      return;
    }

    const author = value as Record<string, unknown>;

    if (!author['name'] || typeof author['name'] !== 'string') {
      this.errors.push({ field: 'author.name', message: 'Author name is required and must be a string' });
    }

    if (author['email'] !== undefined && typeof author['email'] !== 'string') {
      this.errors.push({ field: 'author.email', message: 'Author email must be a string' });
    }

    if (author['url'] !== undefined) {
      this.validateUrl(author['url'], 'author.url');
    }
  }

  private validatePlatforms(value: unknown): void {
    if (!value || typeof value !== 'object') {
      this.errors.push({ field: 'platforms', message: 'Platforms must be an object' });
      return;
    }

    const platforms = value as Record<string, unknown>;
    const validPlatforms = ['darwin', 'win32', 'linux'];

    for (const [platform, platformConfig] of Object.entries(platforms)) {
      if (!validPlatforms.includes(platform)) {
        this.errors.push({
          field: `platforms.${platform}`,
          message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
        });
        continue;
      }

      if (!platformConfig || typeof platformConfig !== 'object') {
        this.errors.push({ field: `platforms.${platform}`, message: 'Platform config must be an object' });
      }
    }
  }

  private validateArray(
    value: unknown,
    field: string,
    itemValidator: (item: unknown, index: number) => void
  ): void {
    if (!Array.isArray(value)) {
      this.errors.push({ field, message: `${field} must be an array` });
      return;
    }

    value.forEach((item, index) => {
      itemValidator(item, index);
    });
  }

  private validateTool(value: unknown, index: number): void {
    if (!value || typeof value !== 'object') {
      this.errors.push({ field: `tools[${index}]`, message: 'Tool must be an object' });
      return;
    }

    const tool = value as Record<string, unknown>;

    if (!tool['name'] || typeof tool['name'] !== 'string') {
      this.errors.push({ field: `tools[${index}].name`, message: 'Tool name is required and must be a string' });
    }

    if (tool['description'] !== undefined && typeof tool['description'] !== 'string') {
      this.errors.push({ field: `tools[${index}].description`, message: 'Tool description must be a string' });
    }
  }

  private validatePrompt(value: unknown, index: number): void {
    if (!value || typeof value !== 'object') {
      this.errors.push({ field: `prompts[${index}]`, message: 'Prompt must be an object' });
      return;
    }

    const prompt = value as Record<string, unknown>;

    if (!prompt['name'] || typeof prompt['name'] !== 'string') {
      this.errors.push({ field: `prompts[${index}].name`, message: 'Prompt name is required and must be a string' });
    }

    if (prompt['description'] !== undefined && typeof prompt['description'] !== 'string') {
      this.errors.push({ field: `prompts[${index}].description`, message: 'Prompt description must be a string' });
    }
  }

  private validateResource(value: unknown, index: number): void {
    if (!value || typeof value !== 'object') {
      this.errors.push({ field: `resources[${index}]`, message: 'Resource must be an object' });
      return;
    }

    const resource = value as Record<string, unknown>;

    if (!resource['name'] || typeof resource['name'] !== 'string') {
      this.errors.push({
        field: `resources[${index}].name`,
        message: 'Resource name is required and must be a string',
      });
    }

    if (resource['description'] !== undefined && typeof resource['description'] !== 'string') {
      this.errors.push({
        field: `resources[${index}].description`,
        message: 'Resource description must be a string',
      });
    }
  }
}

export function validateManifest(manifest: unknown): { valid: boolean; errors: ValidationError[] } {
  const validator = new ManifestValidator();
  const valid = validator.validate(manifest);
  return { valid, errors: validator.getErrors() };
}
