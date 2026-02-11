import * as jose from 'jose';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const MPAK_AUDIENCE = process.env['OIDC_AUDIENCE'] || 'https://mpak.dev';

// Cache JWKS at module scope so jose handles key rotation internally
const JWKS = jose.createRemoteJWKSet(
  new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`)
);

export interface GitHubOIDCClaims {
  repository: string;
  repository_owner: string;
  repository_owner_id: string;
  workflow: string;
  workflow_ref: string;
  ref: string;
  ref_type: string;
  sha: string;
  actor: string;
  actor_id: string;
  run_id: string;
  run_number: string;
  run_attempt: string;
  event_name: string;
  job_workflow_ref: string;
}

/**
 * Verify a GitHub Actions OIDC token
 */
export async function verifyGitHubOIDC(
  token: string
): Promise<GitHubOIDCClaims> {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: GITHUB_OIDC_ISSUER,
    audience: MPAK_AUDIENCE,
  });

  return {
    repository: payload['repository'] as string,
    repository_owner: payload['repository_owner'] as string,
    repository_owner_id: payload['repository_owner_id'] as string,
    workflow: payload['workflow'] as string,
    workflow_ref: payload['workflow_ref'] as string,
    ref: payload['ref'] as string,
    ref_type: payload['ref_type'] as string,
    sha: payload['sha'] as string,
    actor: payload['actor'] as string,
    actor_id: payload['actor_id'] as string,
    run_id: payload['run_id'] as string,
    run_number: payload['run_number'] as string,
    run_attempt: payload['run_attempt'] as string,
    event_name: payload['event_name'] as string,
    job_workflow_ref: payload['job_workflow_ref'] as string,
  };
}

/**
 * Provenance JSON structure
 */
export interface ProvenanceRecord {
  schema_version: number;
  provider: 'github_oidc' | 'gitlab_oidc' | 'manual';
  repository: string;
  sha: string;
  claims: {
    owner: string;
    owner_id: string;
    actor: string;
    actor_id: string;
    workflow: string;
    workflow_ref: string;
    ref: string;
    ref_type: string;
    run_id: string;
    run_number: string;
    run_attempt: string;
    event_name: string;
    job_workflow_ref: string;
  };
}

/**
 * Build a versioned provenance record from OIDC claims
 */
export function buildProvenance(claims: GitHubOIDCClaims): ProvenanceRecord {
  return {
    schema_version: 1,
    provider: 'github_oidc',
    repository: claims.repository,
    sha: claims.sha,
    claims: {
      owner: claims.repository_owner,
      owner_id: claims.repository_owner_id,
      actor: claims.actor,
      actor_id: claims.actor_id,
      workflow: claims.workflow,
      workflow_ref: claims.workflow_ref,
      ref: claims.ref,
      ref_type: claims.ref_type,
      run_id: claims.run_id,
      run_number: claims.run_number,
      run_attempt: claims.run_attempt,
      event_name: claims.event_name,
      job_workflow_ref: claims.job_workflow_ref,
    },
  };
}
