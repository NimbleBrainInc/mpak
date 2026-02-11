import axios from 'axios';
import { API_URL } from './siteConfig';

const httpClient = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Error logging interceptor
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log API errors for debugging
    if (error.response) {
      console.error(`API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
        status: error.response.status,
        data: error.response.data,
        message: error.message
      });
    } else if (error.request) {
      console.error(`Network Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
        message: error.message
      });
    } else {
      console.error('Request Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Adds access tokens in all api requests
// This interceptor is only added when the clerk instance is ready and exports the getToken method
export const addAccessTokenInterceptor = (getToken: (options?: { template?: string; skipCache?: boolean }) => Promise<string | null>) => {
  httpClient.interceptors.request.use(async (config) => {
    const token = await getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
};

export default httpClient;
