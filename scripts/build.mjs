#!/usr/bin/env node
// Original build script — PATH C, DeepSeek. Contains no baseline code.
//
// Ordered concatenation of src/NN-*.js parts into dist/wdb-bot.user.js.
// No bundler, no minifier, no sourcemap — byte-identity of assembled parts
// is required so mlLib.toString() inside the worker remains valid (Qwen v2 APPROVED).
//
// Pre-permission-gate: src/ is empty; exit 0 with a clear message and produce
// nothing. Post-gate: assemble and pin sha256 + byte count in dist/manifest.json.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC  = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const OUT  = join(DIST, 'wdb-bot.user.js');
const META = join(DIST, 'wdb-bot.meta.js');
const MAN  = join(DIST, 'manifest.json');

const fail = (m) => { console.error('build: ' + m); process.exit(1); };
const note = (m) => console.log('build: ' + m);

if (!existsSync(SRC)) { note('no src/ — pre-gate state, nothing to assemble'); process.exit(0); }
const parts = readdirSync(SRC).filter((n) => /^\d\d-.+\.js$/.test(n)).sort();
if (parts.length === 0) { note('no src/NN-*.js parts — pre-gate state, nothing to assemble'); process.exit(0); }
if (parts.length < 2) fail('need >= 2 ordered parts; got ' + parts.join(', '));

const chunks = parts.map((p) => {
  const text = readFileSync(join(SRC, p), 'utf8');
  return { p, text, isHead: /^\/\/ ==UserScript==/.test(text) };
});
if (!chunks[0].isHead) fail(parts[0] + ': must begin with the ==UserScript== header');
chunks.slice(1).forEach((c) => { if (c.isHead) fail(c.p + ': only the first part may carry the header'); });

const head = chunks[0].text;
for (const pin of ['@match        https://bonk.io/gameframe-release.html*',
                   '@run-at       document-start',
                   '@grant        none']) {
  if (!head.includes(pin)) fail('header missing pinned line: ' + pin);
}
if (/@grant\s+(?!none\b)\S+/.test(head)) fail('header has a non-none @grant — silent brain loss risk');

const out = chunks.map((c) => c.text).join('\n');
if (!/\}\)\(\);\s*$/.test(out)) fail('assembled output does not end on })(); — IIFE not closed');

const hEnd = head.indexOf('// ==/UserScript==');
if (hEnd < 0) fail('header block not closed (no // ==/UserScript==)');
const meta = head.slice(0, hEnd + '// ==/UserScript=='.length) + '\n';

mkdirSync(DIST, { recursive: true });
writeFileSync(OUT, out, 'utf8');
writeFileSync(META, meta, 'utf8');
const buf = readFileSync(OUT);
const sha = createHash('sha256').update(buf).digest('hex');
writeFileSync(MAN, JSON.stringify({ file: 'wdb-bot.user.js', bytes: buf.length, sha256: sha,
  parts, builtAt: new Date().toISOString() }, null, 2) + '\n');
note(`assembled ${parts.length} parts -> ${OUT}`);
note(`bytes ${buf.length}  sha256 ${sha.slice(0, 16)}…`);