/**
 * Discord Webhook Notifications
 * Non-blocking notifications for package announcements
 */

const DISCORD_WEBHOOK_URL = process.env['DISCORD_WEBHOOK_URL'] || '';

export type PackageType = 'bundle' | 'skill';

interface AnnounceNotification {
  name: string;
  version: string;
  type: PackageType;
  repo?: string;
}

/**
 * Send a non-blocking Discord notification for a new package announcement.
 * Errors are silently logged, never thrown.
 */
export function notifyDiscordAnnounce(data: AnnounceNotification): void {
  const typeLabel = data.type === 'bundle' ? 'Bundle' : 'Skill';
  const registryUrl = `https://mpak.dev/${data.type === 'bundle' ? 'packages' : 'skills'}/${encodeURIComponent(data.name)}`;

  const content = [
    `**New ${typeLabel} Published**`,
    `**${data.name}** v${data.version}`,
    data.repo ? `[GitHub](https://github.com/${data.repo})` : null,
    `[View on mpak.dev](${registryUrl})`,
  ].filter(Boolean).join('\n');

  if (!DISCORD_WEBHOOK_URL) return;

  fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }).catch((err: Error) => {
    console.error('[discord] webhook failed:', err.message);
  });
}
