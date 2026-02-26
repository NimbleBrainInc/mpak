import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { extractSkillContent } from '../src/utils/skill-content.js';

function makeZip(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, 'utf-8'));
  }
  return zip.toBuffer();
}

const SKILL_MD = `---
name: my-skill
version: 1.0.0
---
This is the skill body content.

It has multiple paragraphs.`;

describe('extractSkillContent', () => {
  it('extracts body from nested SKILL.md (skill-pack structure)', () => {
    const buf = makeZip({ 'my-skill/SKILL.md': SKILL_MD });
    const result = extractSkillContent(buf);
    expect(result).toBe('This is the skill body content.\n\nIt has multiple paragraphs.');
  });

  it('extracts body from root SKILL.md', () => {
    const buf = makeZip({ 'SKILL.md': SKILL_MD });
    const result = extractSkillContent(buf);
    expect(result).toBe('This is the skill body content.\n\nIt has multiple paragraphs.');
  });

  it('returns undefined when ZIP has no SKILL.md', () => {
    const buf = makeZip({ 'README.md': '# Hello' });
    expect(extractSkillContent(buf)).toBeUndefined();
  });

  it('returns undefined for frontmatter-only SKILL.md (no body)', () => {
    const buf = makeZip({
      'SKILL.md': `---
name: my-skill
version: 1.0.0
---`,
    });
    expect(extractSkillContent(buf)).toBeUndefined();
  });

  it('returns undefined for empty body after frontmatter', () => {
    const buf = makeZip({
      'SKILL.md': `---
name: my-skill
---


`,
    });
    expect(extractSkillContent(buf)).toBeUndefined();
  });

  it('handles CRLF line endings in frontmatter', () => {
    const crlf = '---\r\nname: my-skill\r\n---\r\nBody with CRLF.';
    const buf = makeZip({ 'SKILL.md': crlf });
    expect(extractSkillContent(buf)).toBe('Body with CRLF.');
  });

  it('returns undefined for non-ZIP buffer', () => {
    const garbage = Buffer.from('this is not a zip file');
    expect(extractSkillContent(garbage)).toBeUndefined();
  });

  it('returns undefined for SKILL.md with no frontmatter', () => {
    const buf = makeZip({ 'SKILL.md': 'Just some markdown without frontmatter.' });
    expect(extractSkillContent(buf)).toBeUndefined();
  });

  it('picks first match when multiple SKILL.md files exist', () => {
    const zip = new AdmZip();
    zip.addFile(
      'a-skill/SKILL.md',
      Buffer.from('---\nname: first\n---\nFirst body.')
    );
    zip.addFile(
      'b-skill/SKILL.md',
      Buffer.from('---\nname: second\n---\nSecond body.')
    );
    const result = extractSkillContent(zip.toBuffer());
    expect(result).toBe('First body.');
  });
});
