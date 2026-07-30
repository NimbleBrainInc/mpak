/**
 * The announcement link is the part of this module that has already been wrong
 * in production: it pointed at the marketing host after package pages moved to
 * the registry, and every announcement linked to a 404 without anything
 * failing. These assertions are about the URL, not the webhook plumbing.
 *
 * Both DISCORD_WEBHOOK_URL and the origin are read when the module loads, so
 * each case stubs the environment and then imports dynamically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEBHOOK = 'https://discord.example/api/webhooks/1/token';

async function announce(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const spy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', spy);

  const { notifyDiscordAnnounce } = await import('../src/utils/discord.js');
  notifyDiscordAnnounce({ name: '@nimblebraininc/echo', version: '1.0.0' });
  return spy;
}

function postedContent(spy: ReturnType<typeof vi.fn>): string {
  const body = spy.mock.calls[0]?.[1]?.body;
  return JSON.parse(String(body)).content as string;
}

describe('notifyDiscordAnnounce', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('links to the host that serves package pages, not the marketing site', async () => {
    const spy = await announce({ DISCORD_WEBHOOK_URL: WEBHOOK, MPAK_PUBLIC_URL: undefined });
    const content = postedContent(spy);

    expect(content).toContain('https://registry.mpak.dev/packages/%40nimblebraininc%2Fecho');
    // The old value, and a substring of the correct one — so it must be
    // matched with its scheme, not bare.
    expect(content).not.toContain('https://mpak.dev/packages');
  });

  it('uses the configured origin, without doubling the separator', async () => {
    const spy = await announce({
      DISCORD_WEBHOOK_URL: WEBHOOK,
      MPAK_PUBLIC_URL: 'https://reg.example.com/',
    });

    expect(postedContent(spy)).toContain(
      'https://reg.example.com/packages/%40nimblebraininc%2Fecho',
    );
  });

  it('posts nothing when no webhook is configured', async () => {
    const spy = await announce({ DISCORD_WEBHOOK_URL: undefined });
    expect(spy).not.toHaveBeenCalled();
  });
});
