/**
 * OIDC utility tests.
 *
 * Tests buildProvenance (pure function, no network calls).
 * verifyGitHubOIDC requires live JWKS so it is tested via integration/mocking
 * in the route tests.
 */

import { describe, it, expect } from 'vitest';
import { buildProvenance, type GitHubOIDCClaims } from '../src/lib/oidc.js';

const mockClaims: GitHubOIDCClaims = {
  repository: 'test-org/test-repo',
  repository_owner: 'test-org',
  repository_owner_id: '12345',
  workflow: '.github/workflows/publish.yml',
  workflow_ref: 'test-org/test-repo/.github/workflows/publish.yml@refs/tags/v1.0.0',
  ref: 'refs/tags/v1.0.0',
  ref_type: 'tag',
  sha: 'abc123def456',
  actor: 'test-user',
  actor_id: '67890',
  run_id: '123456789',
  run_number: '42',
  run_attempt: '1',
  event_name: 'release',
  job_workflow_ref: 'test-org/test-repo/.github/workflows/publish.yml@refs/tags/v1.0.0',
};

describe('buildProvenance', () => {
  it('creates correct top-level provenance fields', () => {
    const provenance = buildProvenance(mockClaims);

    expect(provenance.schema_version).toBe(1);
    expect(provenance.provider).toBe('github_oidc');
    expect(provenance.repository).toBe('test-org/test-repo');
    expect(provenance.sha).toBe('abc123def456');
  });

  it('maps all claim fields into claims object', () => {
    const provenance = buildProvenance(mockClaims);

    expect(provenance.claims).toEqual({
      owner: 'test-org',
      owner_id: '12345',
      actor: 'test-user',
      actor_id: '67890',
      workflow: '.github/workflows/publish.yml',
      workflow_ref: 'test-org/test-repo/.github/workflows/publish.yml@refs/tags/v1.0.0',
      ref: 'refs/tags/v1.0.0',
      ref_type: 'tag',
      run_id: '123456789',
      run_number: '42',
      run_attempt: '1',
      event_name: 'release',
      job_workflow_ref: 'test-org/test-repo/.github/workflows/publish.yml@refs/tags/v1.0.0',
    });
  });

  it('returns a new object each call (no shared references)', () => {
    const a = buildProvenance(mockClaims);
    const b = buildProvenance(mockClaims);
    expect(a).not.toBe(b);
    expect(a.claims).not.toBe(b.claims);
  });
});
