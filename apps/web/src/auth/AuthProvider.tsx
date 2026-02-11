import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from '@clerk/clerk-react';
import { addAccessTokenInterceptor } from '../lib/httpClient';
import { useMe, type User } from '../hooks/useAuthQueries';

// Whether Clerk auth is configured (build-time constant)
export const authEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// The auth contract - what all components consume
interface AuthState {
  isAuthenticated: boolean;
  isLoaded: boolean;
  user: User | null;
  getToken: () => Promise<string | null>;
  error: string | null;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isLoaded: true,
  user: null,
  getToken: async () => null,
  error: null,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// Conditional rendering helpers (replace Clerk's <SignedIn>/<SignedOut>)
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : null;
}

export function GuestGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoaded } = useAuth();
  return isLoaded && !isAuthenticated ? <>{children}</> : null;
}

// --- Clerk implementation (only rendered when VITE_CLERK_PUBLISHABLE_KEY is set) ---

function ClerkAuthInner({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const [interceptorReady, setInterceptorReady] = useState(false);
  const interceptorAddedRef = useRef(false);

  // Set up token interceptor once Clerk is loaded
  useEffect(() => {
    if (isLoaded && !interceptorAddedRef.current) {
      interceptorAddedRef.current = true;
      addAccessTokenInterceptor(getToken);
      setInterceptorReady(true);
    }
  }, [isLoaded, getToken]);

  // Fetch backend user when signed in and interceptor is ready
  const { data: user, error: meError } = useMe(
    interceptorReady && isLoaded && !!isSignedIn && !!clerkUser
  );

  const value: AuthState = {
    isAuthenticated: !!isSignedIn && !!user,
    isLoaded,
    user: user || null,
    getToken,
    error: meError?.message || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY!}>
      <ClerkAuthInner>{children}</ClerkAuthInner>
    </ClerkProvider>
  );
}

// --- No-op implementation (local dev without Clerk key) ---

const noopState: AuthState = {
  isAuthenticated: false,
  isLoaded: true,
  user: null,
  getToken: async () => null,
  error: null,
};

// --- Public provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authEnabled) {
    return <AuthContext.Provider value={noopState}>{children}</AuthContext.Provider>;
  }

  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}
