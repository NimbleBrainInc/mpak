import { mpak } from '../../utils/config.js';
import { logger } from '../../utils/format.js';

export interface ShowOptions {
  json?: boolean;
}

/**
 * Handle the skill show command
 */
export async function handleSkillShow(name: string, options: ShowOptions): Promise<void> {
  try {
    const skill = await mpak.client.getSkill(name);

    if (options.json) {
      console.log(JSON.stringify(skill, null, 2));
      return;
    }

    logger.info('');
    logger.info(`${skill.name}@${skill.latest_version}`);
    logger.info('');
    logger.info(skill.description);
    logger.info('');

    // Metadata section
    logger.info('Metadata:');
    if (skill.license) logger.info(`  License: ${skill.license}`);
    if (skill.category) logger.info(`  Category: ${skill.category}`);
    if (skill.tags && skill.tags.length > 0) logger.info(`  Tags: ${skill.tags.join(', ')}`);
    if (skill.author)
      logger.info(
        `  Author: ${skill.author.name}${skill.author.url ? ` (${skill.author.url})` : ''}`,
      );
    logger.info(`  Downloads: ${skill.downloads.toLocaleString()}`);
    logger.info(`  Published: ${new Date(skill.published_at).toLocaleDateString()}`);

    // Triggers
    if (skill.triggers && skill.triggers.length > 0) {
      logger.info('');
      logger.info('Triggers:');
      skill.triggers.forEach((t) => logger.info(`  - ${t}`));
    }

    // Examples
    if (skill.examples && skill.examples.length > 0) {
      logger.info('');
      logger.info('Examples:');
      skill.examples.forEach((ex) => {
        logger.info(`  - "${ex.prompt}"${ex.context ? ` (${ex.context})` : ''}`);
      });
    }

    // Versions
    if (skill.versions && skill.versions.length > 0) {
      logger.info('');
      logger.info('Versions:');
      skill.versions.slice(0, 5).forEach((v) => {
        logger.info(
          `  ${v.version.padEnd(12)} ${new Date(v.published_at).toLocaleDateString().padEnd(12)} ${v.downloads.toLocaleString()} downloads`,
        );
      });
      if (skill.versions.length > 5) {
        logger.info(`  ... and ${skill.versions.length - 5} more`);
      }
    }

    logger.info('');
    logger.info(`Install: mpak skill install ${skill.name}`);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
  }
}
