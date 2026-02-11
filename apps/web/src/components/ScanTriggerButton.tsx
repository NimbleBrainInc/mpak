import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import httpClient from '../lib/httpClient';

interface ScanTriggerButtonProps {
  packageName: string;
  version?: string;
}

export default function ScanTriggerButton({ packageName, version }: ScanTriggerButtonProps) {
  const { isAuthenticated, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Only show for authenticated admins
  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  async function triggerScan() {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await httpClient.post<{ success: boolean; scanId?: string; message: string }>(
        '/app/scan-trigger',
        { packageName, version }
      );
      setResult({ success: response.data.success, message: response.data.message });
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Failed to trigger scan';
      setResult({ success: false, message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={triggerScan}
        disabled={isLoading}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
          ${isLoading
            ? 'bg-surface-overlay text-mpak-gray-400 border-white/[0.08] cursor-not-allowed'
            : 'bg-accent-purple/10 text-accent-purple-400 border-accent-purple/25 hover:bg-accent-purple/15'
          }
        `}
        title="Trigger security scan (admin only)"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )}
        {isLoading ? 'Scanning...' : 'Scan'}
      </button>

      {result && (
        <span className={`text-xs ${result.success ? 'text-terminal-success' : 'text-terminal-error'}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
