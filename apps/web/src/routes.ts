import { type RouteConfig, index, route } from '@react-router/dev/routes';

// The registry application. Marketing and docs live in NimbleBrainInc/mpak-web
// and serve from mpak.dev; nothing here should render brand copy.
export default [
  index('routes/browse.tsx'),
  route('bundles', 'routes/bundles.tsx'),
  route('packages/*', 'routes/package.tsx'),

  // Signed-in surface. Client-only and noindex — see root.tsx.
  route('login/*', 'routes/login.tsx'),
  route('my-packages', 'routes/my-packages.tsx'),

  // Generated from the registry rather than a build-time snapshot, so it can
  // never advertise packages that no longer exist or miss ones that do.
  route('sitemap-packages.xml', 'routes/sitemap-packages.ts'),
] satisfies RouteConfig;
