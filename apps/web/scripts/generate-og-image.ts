/**
 * OG Image Generator
 *
 * Generates a 1200x630 PNG Open Graph image using Playwright.
 * Uses the same design tokens and branding as the mpak site.
 *
 * Usage:
 *   npx tsx scripts/generate-og-image.ts
 *
 * Output:
 *   public/og-image.png
 */

import { chromium } from '@playwright/test';
import { join } from 'path';

const WIDTH = 1200;
const HEIGHT = 630;

const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background: #0c0a0f;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  /* Subtle grid pattern */
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  /* Gold gradient glow behind logo */
  .glow {
    position: absolute;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -60%);
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
  }

  .logo-row {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .logo-icon {
    width: 72px;
    height: 72px;
  }

  .logo-text {
    font-size: 64px;
    font-weight: 700;
    color: #e0dce8;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 28px;
    font-weight: 500;
    color: #9f99ab;
    text-align: center;
    max-width: 700px;
    line-height: 1.4;
  }

  .tagline em {
    font-style: normal;
    color: #fbbf24;
  }

  .badges {
    display: flex;
    gap: 16px;
    margin-top: 8px;
  }

  .badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: #7a7486;
  }

  .badge.gold {
    color: #fbbf24;
    border-color: rgba(251,191,36,0.25);
    background: rgba(251,191,36,0.08);
  }

  .badge.purple {
    color: #a78bfa;
    border-color: rgba(167,139,250,0.25);
    background: rgba(167,139,250,0.08);
  }

  /* Corner decoration */
  .corner {
    position: absolute;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #4a4458;
  }
  .corner.tl { top: 32px; left: 40px; }
  .corner.br { bottom: 32px; right: 40px; }
</style>
</head>
<body>
  <div class="glow"></div>

  <div class="corner tl">mpak.dev</div>
  <div class="corner br">open source &middot; apache 2.0</div>

  <div class="content">
    <div class="logo-row">
      <svg class="logo-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="29" stroke="#fbbf24" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
        <circle cx="32" cy="32" r="24" fill="rgba(251,191,36,0.12)" stroke="#fbbf24" stroke-width="2"/>
        <circle cx="32" cy="32" r="18" stroke="#fbbf24" stroke-width="1" opacity="0.35"/>
        <text x="32" y="39" text-anchor="middle" font-family="'Space Grotesk', system-ui" font-weight="700" font-size="24" fill="#fbbf24">m</text>
      </svg>
      <span class="logo-text">mpak</span>
    </div>

    <div class="tagline">
      The <em>secure registry</em> for MCP servers and skills
    </div>

    <div class="badges">
      <span class="badge gold">bundles</span>
      <span class="badge purple">skills</span>
      <span class="badge">25 security controls</span>
      <span class="badge">trust scores</span>
    </div>
  </div>
</body>
</html>`;

async function main() {
  console.log('Generating OG image...');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2, // 2x for crisp rendering
  });

  await page.setContent(html, { waitUntil: 'networkidle' });

  // Wait for fonts to load
  await page.waitForTimeout(1000);

  const outputPath = join(process.cwd(), 'public', 'og-image.png');
  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  await browser.close();
  console.log(`OG image written to ${outputPath} (${WIDTH}x${HEIGHT})`);
}

main().catch(console.error);
