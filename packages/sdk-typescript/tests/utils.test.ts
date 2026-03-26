import { describe, expect, it } from 'vitest';
import { parsePackageSpec } from '../src/utils.js';

describe('parsePackageSpec', () => {
  it('parses @scope/name', () => {
    expect(parsePackageSpec('@scope/name')).toEqual({ name: '@scope/name' });
  });

  it('parses @scope/name@1.0.0', () => {
    expect(parsePackageSpec('@scope/name@1.0.0')).toEqual({
      name: '@scope/name',
      version: '1.0.0',
    });
  });

  it('parses @scope/name@latest', () => {
    expect(parsePackageSpec('@scope/name@latest')).toEqual({
      name: '@scope/name',
      version: 'latest',
    });
  });

  it('handles hyphenated scope and name', () => {
    expect(parsePackageSpec('@my-scope/my-name@2.0.0')).toEqual({
      name: '@my-scope/my-name',
      version: '2.0.0',
    });
  });

  it('throws for unscoped name', () => {
    expect(() => parsePackageSpec('name')).toThrow('Invalid package spec');
  });

  it('throws for name without slash', () => {
    expect(() => parsePackageSpec('@scopename')).toThrow('Invalid package spec');
  });

  it('throws for empty string', () => {
    expect(() => parsePackageSpec('')).toThrow('Invalid package spec');
  });

  it('throws for bare version without scope', () => {
    expect(() => parsePackageSpec('name@1.0.0')).toThrow('Invalid package spec');
  });
});
