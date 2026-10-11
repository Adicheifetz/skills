import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { buildCodexPlugin, insertAfterTitle } from './build-codex-plugin.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = buildCodexPlugin({ out: join(mkdtempSync(join(tmpdir(), 'codex-plugin-')), 'wix') });
const startHere = readFileSync(join(ROOT, 'codex/overlay/wix-manage/start-here.md'), 'utf8').trimEnd();

test('inserts the entry after the title and its blank line', () => {
  const skill = ['---', 'name: x', '---', '', '# Title', '', '> note'].join('\n');

  assert.equal(
    insertAfterTitle(skill, '## Start\n\n---\n'),
    ['---', 'name: x', '---', '', '# Title', '', '## Start', '', '---', '', '> note'].join('\n')
  );
});

test('the Codex wix-manage SKILL.md starts with the Wix MCP entry', () => {
  const skill = readFileSync(join(out, 'skills/wix-manage/SKILL.md'), 'utf8');

  assert.ok(skill.includes(`# Management Recipes Index\n\n${startHere}\n`));
  assert.ok(existsSync(join(out, 'skills/wix-manage/references/wix-mcp/wix-mcp-readme.md')));
  assert.ok(!existsSync(join(out, 'skills/wix-manage/start-here.md')));
});

test('the shared wix-manage skill is left unchanged', () => {
  const sharedSkill = readFileSync(join(ROOT, 'skills/wix-manage/SKILL.md'), 'utf8');
  const codexSkill = readFileSync(join(out, 'skills/wix-manage/SKILL.md'), 'utf8');

  assert.ok(!sharedSkill.includes('Start Here — Wix MCP'));
  assert.equal(codexSkill.replace(`${startHere}\n\n`, ''), sharedSkill);
  assert.ok(!existsSync(join(ROOT, 'skills/wix-manage/references/wix-mcp')));
});

test('the manifest lists every packaged skill, each with a SKILL.md', () => {
  const manifest = JSON.parse(readFileSync(join(out, '.codex-plugin/plugin.json'), 'utf8'));
  const sourceManifest = JSON.parse(readFileSync(join(ROOT, '.codex-plugin/plugin.json'), 'utf8'));

  assert.equal(manifest.skills.length, sourceManifest.skills.length);
  for (const skillPath of manifest.skills) {
    assert.match(skillPath, /^\.\/skills\/[\w-]+$/);
    assert.ok(existsSync(join(out, skillPath, 'SKILL.md')), `${skillPath}/SKILL.md`);
  }
  assert.ok(existsSync(join(out, manifest.mcpServers)));
  assert.ok(existsSync(join(out, manifest.interface.logo)));
});

test('the Codex package connects to the MCP without WixREADME; the shared config is unchanged', () => {
  const manifest = JSON.parse(readFileSync(join(out, '.codex-plugin/plugin.json'), 'utf8'));
  const codexServers = JSON.parse(readFileSync(join(out, manifest.mcpServers), 'utf8')).mcpServers;
  const sharedServers = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')).mcpServers;

  assert.equal(codexServers['wix-mcp'].url, 'https://mcp.wix.com/mcp?disableTools=WixREADME');
  assert.equal(sharedServers['wix-mcp'].url, 'https://mcp.wix.com/mcp');
});
