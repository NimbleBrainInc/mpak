import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import RootLayout from './layouts/RootLayout';
import './index.css';

export function links() {
  return [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/manifest.json' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=optional',
    },
  ];
}

// One client per request on the server, one for the session in the browser.
// Sharing a module-level client across requests would leak one visitor's cache
// into another's response.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

/**
 * Google Tag Manager, inlined in the document head so the container loads
 * before render rather than after hydration.
 *
 * The id is checked against the container-id shape because it is interpolated
 * into a script body: a malformed value would otherwise emit script that either
 * breaks the page or runs something unintended. Absent or unrecognised, no tag
 * is emitted and no request is made — which is the self-host default.
 */
const GTM_ID = /^GTM-[A-Z0-9]+$/.test(import.meta.env.VITE_GTM_ID ?? '')
  ? import.meta.env.VITE_GTM_ID
  : undefined;

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof document === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0c0a0f" />
        <Meta />
        <Links />
        {GTM_ID && (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: GTM ships as an inline loader
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        )}
      </head>
      <body>
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
              title="Google Tag Manager"
            />
          </noscript>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <AuthProvider>
        <RootLayout>
          <Outlet />
        </RootLayout>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const isResponse = isRouteErrorResponse(error);
  const status = isResponse ? error.status : 500;
  const title = isResponse && status === 404 ? 'Package not found' : 'Something went wrong';
  const detail = isResponse
    ? error.statusText || error.data
    : 'The registry could not complete this request.';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
      <p className="font-mono text-sm text-mpak-gray-500 mb-3">{status}</p>
      <h1 className="text-3xl font-bold text-mpak-gray-900 mb-3">{title}</h1>
      <p className="text-mpak-gray-600 mb-8">{detail}</p>
      <a
        href="/"
        className="px-4 py-2 bg-accent-gold-400 text-mpak-dark font-medium rounded-lg hover:bg-accent-gold-500 transition-colors"
      >
        Browse the registry
      </a>
    </div>
  );
}
