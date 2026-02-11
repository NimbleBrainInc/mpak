import { useQuery } from '@tanstack/react-query';
import httpClient from '../lib/httpClient';

// Auth user profile from backend
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  githubUsername: string | null;
  githubLinked: boolean;
  verified: boolean;
  publishedBundles: number;
  totalDownloads: number;
  role: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

// Query keys factory
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

// API functions
const fetchMe = async (): Promise<User> => {
  const response = await httpClient.get<User>('/app/auth/me');
  return response.data;
};

// React Query hooks
export const useMe = (enabled: boolean = true) => {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchMe,
    enabled,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    retry: 1,
  });
};
