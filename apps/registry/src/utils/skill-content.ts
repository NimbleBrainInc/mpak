import AdmZip from 'adm-zip';

/**
 * Extract the body content from SKILL.md inside a .skill ZIP archive.
 *
 * Looks for a `SKILL.md` entry (nested or root), parses YAML frontmatter,
 * and returns the body text after the closing `---` delimiter.
 *
 * Returns `undefined` if the ZIP contains no SKILL.md, the file has no
 * frontmatter body, or the buffer is not a valid ZIP.
 */
export function extractSkillContent(zipBuffer: Buffer): string | undefined {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return undefined;
  }

  const skillEntry = zip
    .getEntries()
    .find((e) => e.entryName.endsWith('/SKILL.md') || e.entryName === 'SKILL.md');

  if (!skillEntry) {
    return undefined;
  }

  const fileContent = skillEntry.getData().toString('utf-8');
  const fmMatch = fileContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch?.[1]) {
    return undefined;
  }

  const body = fmMatch[1].trim();
  return body.length > 0 ? body : undefined;
}
