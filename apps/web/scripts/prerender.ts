/**
 * Prerender static routes to HTML at build time.
 * Uses Playwright to render each route with full JS execution,
 * capturing the output of useSEO() hooks and all rendered content.
 *
 * Usage:
 *   tsx scripts/prerender.ts
 *   SKIP_PRERENDER=true tsx scripts/prerender.ts  # skip in CI
 */
import { chromium } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve(import.meta.dirname, '../dist');
const PORT = 4173;

const STATIC_ROUTES = [
  '/',
  '/security',
  '/security/controls',
  '/publish',
  '/publish/bundles',
  '/publish/skills',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

// Browse pages - will wait longer for API data
const DATA_ROUTES = [
  '/bundles',
  '/skills',
];

const ALL_ROUTES = [...STATIC_ROUTES, ...DATA_ROUTES];

// Skip if explicitly disabled
if (process.env.SKIP_PRERENDER === 'true') {
  console.log('Prerendering skipped (SKIP_PRERENDER=true)');
  process.exit(0);
}

// Simple static file server for dist/
function createServer(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    let filePath = path.join(DIST, url.pathname);

    // Try exact file, then directory index, then SPA fallback
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST, 'index.html');
    }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
    };

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

async function prerender() {
  console.log('Starting prerender...');

  // Start static server
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Static server listening on http://localhost:${PORT}`);

  // Launch browser
  const browser = await chromium.launch();
  const context = await browser.newContext();

  let successCount = 0;
  let failCount = 0;

  for (const route of ALL_ROUTES) {
    const url = `http://localhost:${PORT}${route}`;
    const isDataRoute = DATA_ROUTES.includes(route);

    try {
      const page = await context.newPage();

      // Navigate and wait for content to render
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: isDataRoute ? 30000 : 15000,
      });

      // Extra wait for data routes to let React Query settle
      if (isDataRoute) {
        await page.waitForTimeout(2000);
      }

      // Get the rendered HTML
      let html = await page.content();

      // Strip Vite HMR scripts if any leaked through
      html = html.replace(/<script[^>]*type="module"[^>]*src="\/@vite\/client"[^>]*><\/script>/g, '');
      html = html.replace(/<script[^>]*type="module"[^>]*src="\/@react-refresh"[^>]*><\/script>/g, '');

      // Determine output path
      let outputPath: string;
      if (route === '/') {
        outputPath = path.join(DIST, 'index.html');
      } else {
        outputPath = path.join(DIST, route, 'index.html');
      }

      // Ensure directory exists
      const dir = path.dirname(outputPath);
      fs.mkdirSync(dir, { recursive: true });

      // Write pre-rendered HTML
      fs.writeFileSync(outputPath, html, 'utf-8');
      console.log(`  ✓ ${route} → ${path.relative(DIST, outputPath)}`);
      successCount++;

      await page.close();
    } catch (err) {
      console.warn(`  ✗ ${route}: ${(err as Error).message}`);
      failCount++;
    }
  }

  // Cleanup
  await browser.close();
  server.close();

  console.log(`\nPrerender complete: ${successCount} succeeded, ${failCount} failed`);
  if (failCount > 0) {
    console.warn('Some routes failed to prerender. They will fall back to the SPA shell.');
  }
}

prerender().catch((err) => {
  console.error('Prerender failed:', err);
  // Don't fail the build - SPA still works without prerendering
  process.exit(0);
});
