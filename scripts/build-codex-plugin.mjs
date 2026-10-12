#!/usr/bin/env node
/**
 * Builds the Codex plugin package: the skills listed in .codex-plugin/plugin.json, with the
 * Codex-only files in codex/overlay/<skill>/ applied on top, plus the manifest, MCP config and
 * assets. The shared skills/ folder is never modified, so other clients don't see the overlay.
 *
 * The MCP config comes from codex/mcp.json. It turns WixREADME off, because the overlay ships
 * the README in wix-manage instead.
 *
 * The package carries the manifest and MCP config twice: the Agent Plugins format (plugin.json,
 * mcp.json at the root) and the legacy Codex one (.codex-plugin/plugin.json, .mcp.json).
 *
 * Overlay rules, per skill:
 * - start-here.md is inserted into the skill's SKILL.md right after its first `# ` heading.
 * - Every other file is added to the skill. An overlay may only add files, never replace one.
 *
 * Usage: node scripts/build-codex-plugin.mjs [--out <dir>] [--zip]
 *        --out  output folder (default: codex/dist/wix)
 *        --zip  also write <out>.zip, the package to submit to OpenAI
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { basename, dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const START_HERE = 'start-here.md';
const AGENT_PLUGINS_SCHEMAS = 'https://agent-plugins.org/schemas/1.0.0';
const PORTABLE_MANIFEST_FIELDS = ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'];

function listFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

export function insertAfterTitle(skillMarkdown, entry) {
  const lines = skillMarkdown.split('\n');
  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  if (titleIndex === -1) {
    throw new Error('SKILL.md has no `# ` heading to insert the start-here entry after');
  }
  const insertAt = lines[titleIndex + 1] === '' ? titleIndex + 2 : titleIndex + 1;
  lines.splice(insertAt, 0, ...entry.trimEnd().split('\n'), '');
  return lines.join('\n');
}

function applyOverlay(overlayDir, skillDir) {
  for (const overlayFile of listFiles(overlayDir)) {
    const relativePath = relative(overlayDir, overlayFile);
    if (relativePath === START_HERE) {
      const skillPath = join(skillDir, 'SKILL.md');
      writeFileSync(skillPath, insertAfterTitle(readFileSync(skillPath, 'utf8'), readFileSync(overlayFile, 'utf8')));
      continue;
    }
    const target = join(skillDir, relativePath);
    if (existsSync(target)) {
      throw new Error(`Overlay would replace ${relative(ROOT, target)}; overlays may only add files`);
    }
    mkdirSync(dirname(target), { recursive: true });
    cpSync(overlayFile, target);
  }
}

export function toPortableManifest(manifest) {
  const fields = PORTABLE_MANIFEST_FIELDS.filter((field) => field in manifest).map((field) => [field, manifest[field]]);
  return {
    $schema: `${AGENT_PLUGINS_SCHEMAS}/plugin.schema.json`,
    ...Object.fromEntries(fields),
    extensions: { 'com.openai': { interface: manifest.interface } },
  };
}

export function toPortableMcpConfig(mcpConfig) {
  const servers = Object.entries(mcpConfig.mcpServers).map(([name, server]) => [
    name,
    server.type === 'http' ? { ...server, type: 'streamable-http' } : server,
  ]);
  return { $schema: `${AGENT_PLUGINS_SCHEMAS}/mcp.schema.json`, mcpServers: Object.fromEntries(servers) };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function buildCodexPlugin({ root = ROOT, out = join(ROOT, 'codex/dist/wix') } = {}) {
  const manifest = JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, '.codex-plugin'), { recursive: true });

  const skillPaths = [];
  for (const skillPath of manifest.skills) {
    const name = basename(skillPath);
    const skillDir = join(out, 'skills', name);
    cpSync(join(root, skillPath), skillDir, { recursive: true });
    const overlayDir = join(root, 'codex/overlay', name);
    if (existsSync(overlayDir)) {
      applyOverlay(overlayDir, skillDir);
    }
    skillPaths.push(`./skills/${name}`);
  }

  const mcpConfig = JSON.parse(readFileSync(join(root, 'codex/mcp.json'), 'utf8'));
  writeJson(join(out, '.codex-plugin/plugin.json'), { ...manifest, skills: skillPaths });
  writeJson(join(out, manifest.mcpServers), mcpConfig);
  writeJson(join(out, 'plugin.json'), toPortableManifest(manifest));
  writeJson(join(out, 'mcp.json'), toPortableMcpConfig(mcpConfig));
  cpSync(join(root, 'assets'), join(out, 'assets'), { recursive: true });
  return out;
}

function main() {
  const outFlag = process.argv.indexOf('--out');
  const out = outFlag === -1 ? undefined : resolve(process.argv[outFlag + 1]);
  const built = buildCodexPlugin(out ? { out } : {});
  console.log(`Built the Codex plugin in ${relative(process.cwd(), built) || '.'}`);
  if (process.argv.includes('--zip')) {
    const zipPath = `${built}.zip`;
    rmSync(zipPath, { force: true });
    execFileSync('zip', ['-qr', zipPath, '.'], { cwd: built });
    console.log(`Wrote ${relative(process.cwd(), zipPath)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
