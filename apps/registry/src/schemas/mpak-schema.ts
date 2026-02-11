/**
 * mpak.json Schema Definition
 */

export const MPAK_SCHEMA_VERSION = '2025-10-19';
export const MPAK_SCHEMA_URL = `https://cdn.mpak.dev/schemas/${MPAK_SCHEMA_VERSION}/mpak.json`;

export interface MpakJson {
  $schema?: string;
  name: string;
  maintainers: string[];
  version?: string;
}

export const MPAK_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: MPAK_SCHEMA_URL,
  title: 'mpak.json',
  description: 'Configuration file for claiming package ownership in the mpak registry',
  type: 'object',
  required: ['name', 'maintainers'],
  properties: {
    $schema: {
      type: 'string',
      description: 'JSON Schema URL for validation',
      default: MPAK_SCHEMA_URL,
    },
    name: {
      type: 'string',
      description: 'Package name in the registry (must be scoped, e.g., @username/package)',
      pattern: '^@[a-z0-9][a-z0-9-]{0,38}/[a-z0-9][a-z0-9-]{0,213}$',
    },
    maintainers: {
      type: 'array',
      description: 'GitHub usernames of package maintainers',
      items: {
        type: 'string',
        pattern: '^[a-z0-9][a-z0-9-]{0,38}$',
      },
      minItems: 1,
    },
    version: {
      type: 'string',
      description: 'Schema version',
    },
  },
  additionalProperties: false,
};

/**
 * Validate mpak.json structure
 */
export function validateMpakJson(data: unknown): {
  valid: boolean;
  errors: string[];
  mpakJson?: MpakJson;
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['mpak.json must be a valid JSON object'] };
  }

  const d = data as Record<string, unknown>;

  if (!d['name'] || typeof d['name'] !== 'string') {
    errors.push('Missing or invalid "name" field');
  }

  if (!d['maintainers'] || !Array.isArray(d['maintainers'])) {
    errors.push('Missing or invalid "maintainers" field (must be an array)');
  } else if ((d['maintainers'] as unknown[]).length === 0) {
    errors.push('At least one maintainer is required');
  }

  const scopedRegex = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,213}$/;
  if (d['name'] && typeof d['name'] === 'string' && !scopedRegex.test(d['name'])) {
    errors.push(
      'Package name must be scoped (e.g., @username/package-name) and follow naming conventions'
    );
  }

  if (Array.isArray(d['maintainers'])) {
    const usernameRegex = /^[a-z0-9][a-z0-9-]{0,38}$/i;
    (d['maintainers'] as unknown[]).forEach((maintainer: unknown, index: number) => {
      if (typeof maintainer !== 'string') {
        errors.push(`Maintainer at index ${index} must be a string`);
      } else if (!usernameRegex.test(maintainer)) {
        errors.push(
          `Invalid GitHub username at index ${index}: "${maintainer}". Must match GitHub username format.`
        );
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    mpakJson: data as MpakJson,
  };
}

/**
 * Generate example mpak.json content
 */
export function generateMpakJsonExample(packageName: string, githubUsername: string): string {
  const example: MpakJson = {
    $schema: MPAK_SCHEMA_URL,
    name: packageName,
    maintainers: [githubUsername],
  };

  return JSON.stringify(example, null, 2);
}
