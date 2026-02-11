import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface ClaimPackageModalProps {
  packageName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ClaimPackageModal({
  packageName,
  isOpen,
  onClose,
}: ClaimPackageModalProps) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [claimStatus, setClaimStatus] = useState<any>(null);
  const [githubRepo, setGithubRepo] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadClaimStatus();
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, packageName]);

  async function loadClaimStatus() {
    try {
      setLoading(true);
      // Get token (optional - will work without it but won't personalize the example)
      const token = await getToken().catch(() => null);
      const status = await api.getClaimStatus(packageName, token || undefined);
      setClaimStatus(status);
      setGithubRepo(status.github_repo || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claim status');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndClaim() {
    if (!githubRepo.trim()) {
      setError('Please enter a GitHub repository');
      return;
    }

    try {
      setVerifying(true);
      setError(null);
      const token = await getToken();
      if (!token) {
        setError('You must be signed in to claim a package');
        return;
      }

      await api.claimPackage(packageName, githubRepo, token);

      // Success! Close modal and redirect with claimed=true
      onClose();
      navigate(`/packages/${packageName}?claimed=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim package');
    } finally {
      setVerifying(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-raised rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-white/[0.08]">
        <div className="p-6 border-b border-white/[0.08]">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-mpak-gray-900">
              Claim Package: {packageName}
            </h2>
            <button
              onClick={onClose}
              className="text-mpak-gray-400 hover:text-mpak-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-gold-400"></div>
              <p className="mt-4 text-mpak-gray-600">Loading claim instructions...</p>
            </div>
          ) : claimStatus ? (
            <div className="space-y-6">
              {/* Instructions */}
              <div>
                <h3 className="text-lg font-semibold text-mpak-gray-900 mb-3">
                  How to claim this package:
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-mpak-gray-700">
                  {claimStatus.instructions?.steps.map((step: string, index: number) => (
                    <li key={index} className="pl-2">{step}</li>
                  ))}
                </ol>
              </div>

              {/* GitHub Repo Input */}
              <div>
                <label className="block text-sm font-medium text-mpak-gray-700 mb-2">
                  GitHub Repository (owner/repo)
                </label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder="e.g., username/my-mcp-server"
                  className="w-full px-4 py-2 bg-surface border border-white/[0.08] rounded-lg text-mpak-gray-900 placeholder:text-mpak-gray-400 focus:ring-2 focus:ring-accent-gold-400 focus:border-accent-gold-400"
                />
                <p className="mt-1 text-sm text-mpak-gray-500">
                  The repository where you'll add the mpak.json file
                </p>
              </div>

              {/* mpak.json Example */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-mpak-gray-700">
                    Add this to your mpak.json file:
                  </label>
                  <button
                    onClick={() => copyToClipboard(claimStatus.instructions?.mpak_json_example || '')}
                    className="text-sm text-accent-gold-400 hover:text-accent-gold-500 font-medium"
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-surface-base text-mpak-gray-800 p-4 rounded-lg overflow-x-auto text-sm border border-white/[0.08]">
                  <code>{claimStatus.instructions?.mpak_json_example}</code>
                </pre>
                {claimStatus.instructions?.verification_url && (
                  <p className="mt-2 text-sm text-mpak-gray-600">
                    We'll verify this file at:{' '}
                    <a
                      href={claimStatus.instructions.verification_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-gold-400 hover:underline"
                    >
                      {claimStatus.instructions.verification_url}
                    </a>
                  </p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-terminal-error/10 border border-terminal-error/20 rounded-lg p-4">
                  <p className="text-terminal-error text-sm">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleVerifyAndClaim}
                  disabled={verifying || !githubRepo.trim()}
                  className="flex-1 bg-accent-gold-400 text-mpak-dark px-6 py-3 rounded-lg font-semibold hover:bg-accent-gold-500 disabled:bg-mpak-gray-400 disabled:text-mpak-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  {verifying ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-mpak-dark" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Verifying...
                    </span>
                  ) : (
                    'Verify & Claim Package'
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 border border-white/[0.08] rounded-lg font-medium text-mpak-gray-700 hover:bg-surface-overlay transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-mpak-gray-600">Failed to load claim information</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
