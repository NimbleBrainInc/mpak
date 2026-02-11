import { SignIn } from '@clerk/clerk-react';
import { authEnabled } from '../auth/AuthProvider';

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-mpak-gray-900 mb-2">Welcome Back</h1>
          <p className="text-mpak-gray-600">Sign in to publish and manage your packages</p>
        </div>
        {authEnabled ? (
          <SignIn routing="path" path="/login" />
        ) : (
          <div className="text-center text-mpak-gray-500 border border-white/[0.08] rounded-lg p-8">
            <p>Authentication is not configured for local development.</p>
            <p className="mt-2 text-sm">Set <code className="bg-surface-overlay px-1 rounded">VITE_CLERK_PUBLISHABLE_KEY</code> in your .env to enable sign-in.</p>
          </div>
        )}
      </div>
    </div>
  );
}
