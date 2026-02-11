import { useAuth } from '../auth/AuthProvider';

export function DebugAuth() {
  const { user, isLoaded, isAuthenticated, error } = useAuth();

  return (
    <div className="fixed bottom-4 right-4 bg-surface-raised border border-white/[0.08] rounded-lg shadow-lg p-4 max-w-md">
      <h3 className="font-bold mb-2 text-mpak-gray-900">Auth Debug</h3>
      <div className="space-y-1 text-xs text-mpak-gray-600">
        <div>Loaded: {isLoaded ? 'Yes' : 'No'}</div>
        <div>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</div>
        <div>Has GitHub: {user?.githubLinked ? 'Yes' : 'No'}</div>
        {error && <div className="text-terminal-error">Error: {error}</div>}
        {user && (
          <div className="mt-2 p-2 bg-surface rounded">
            <div>ID: {user.id}</div>
            <div>Email: {user.email}</div>
            <div>GitHub: {user.githubUsername || 'Not linked'}</div>
            <div>Created: {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
