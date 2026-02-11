import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import RootLayout from './layouts/RootLayout';
import ErrorPage from './pages/ErrorPage';
import HomePage from './pages/HomePage';
import BrowsePackagesPage from './pages/BrowsePackagesPage';
import PackageDetailPage from './pages/PackageDetailPage';
import LoginPage from './pages/LoginPage';
import UserPackagesPage from './pages/UserPackagesPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import SkillsPage from './pages/SkillsPage';
import SkillDetailPage from './pages/SkillDetailPage';
import SecurityPage from './pages/SecurityPage';
import SecurityControlsPage from './pages/SecurityControlsPage';
import PublishGatewayPage from './pages/PublishGatewayPage';
import PublishBundlesPage from './pages/PublishBundlesPage';
import PublishSkillsPage from './pages/PublishSkillsPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Define routes using data router pattern
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootLayout><ErrorPage /></RootLayout>,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'bundles', element: <BrowsePackagesPage /> },
      { path: 'browse', element: <Navigate to="/bundles" replace /> },
      { path: 'packages/*', element: <PackageDetailPage /> },

      { path: 'skills', element: <SkillsPage /> },
      { path: 'skills/*', element: <SkillDetailPage /> },
      { path: 'login/*', element: <LoginPage /> },
      { path: 'my-packages', element: <UserPackagesPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'security/controls', element: <SecurityControlsPage /> },
      { path: 'certified', element: <Navigate to="/security" replace /> },
      { path: 'certified/controls', element: <Navigate to="/security/controls" replace /> },
      { path: 'publish', element: <PublishGatewayPage /> },
      { path: 'publish/bundles', element: <PublishBundlesPage /> },
      { path: 'publish/skills', element: <PublishSkillsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
    ],
  },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
