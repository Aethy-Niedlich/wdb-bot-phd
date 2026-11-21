import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = process.cwd();
const BRAINS = join(ROOT, 'brains');
const MANIFEST = join(BRAINS, 'MANIFEST.json');

function getFiles(dir) {
  let results = [];
  if (!existsSync(dir)) return results;
  const list = readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const res = join(dir, file.name);
    if (file.isDirectory()) results = results.concat(getFiles(res));
    else results.push(res);
  }
  return results;
}

export function checkManifest(quiet = false) {
  if (!existsSync(MANIFEST)) {
    throw new Error('brains/MANIFEST.json is missing (tampering or accident)');
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const rows = manifest.rows || [];
  const files = getFiles(BRAINS).map(f => f.replace(/\\/g, '/').replace(ROOT + '/', ''));
  const manifestPaths = new Set(rows.map(r => r.path));
  
  let errors = 0;
  for (const r of rows) {
    const fullPath = join(ROOT, r.path);
    if (!existsSync(fullPath)) {
      if (!quiet) console.error(`manifest: missing file ${r.path}`);
      errors++;
      continue;
    }
    const buf = readFileSync(fullPath);
    const hash = createHash('sha256').update(buf).digest('hex');
    const expected = r.class === 'synthetic' ? r.expect : r;
    if (!expected) {
       if (!quiet) console.error(`manifest: missing expect field for synthetic row ${r.path}`);
       errors++;
       continue;
    }
    if (buf.length !== expected.bytes || hash !== expected.sha256) {
      if (!quiet) console.error(`manifest: ${r.class} mismatch on ${r.path} (expected ${expected.bytes}b/${expected.sha256}, got ${buf.length}b/${hash})`);
      if (r.class === 'real') {
        if (!quiet) console.error(`  -> restore from git history, never retrain`);
      }
      errors++;
    }
  }
  for (const f of files) {
    if (f === 'brains/MANIFEST.json' || f === 'brains/NOTES.md') continue;
    if (!manifestPaths.has(f)) {
      if (!quiet) {
        console.error(`manifest: untracked file ${f} in brains/`);
        const buf = readFileSync(join(ROOT, f));
        const hash = createHash('sha256').update(buf).digest('hex');
        console.log(`\nMANIFEST_ROW: ${JSON.stringify({ path: f, class: 'real', bytes: buf.length, sha256: hash })}\n`);
      }
      errors++;
    }
  }
  if (errors > 0) throw new Error(`manifest integrity check failed with ${errors} error(s)`);
  if (!quiet) console.log(`manifest: OK (${rows.length} files verified)`);
  return true;
}

export function initManifest() {
  if (!existsSync(BRAINS)) mkdirSync(BRAINS);
  const files = getFiles(BRAINS).map(f => f.replace(/\\/g, '/').replace(ROOT + '/', ''));
  const rows = [];
  for (const f of files) {
    if (f.endsWith('MANIFEST.json') || f.endsWith('NOTES.md')) continue;
    const buf = readFileSync(join(ROOT, f));
    const hash = createHash('sha256').update(buf).digest('hex');
    rows.push({ path: f, class: 'real', bytes: buf.length, sha256: hash });
  }
  writeFileSync(MANIFEST, JSON.stringify({ rows }, null, 2));
  console.log(`manifest: initialized with ${rows.length} files`);
}

export function regenSynthetic() {
  if (!existsSync(MANIFEST)) throw new Error('No manifest');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const rows = manifest.rows || [];
  const synth = rows.filter(r => r.class === 'synthetic');
  if (!synth.length) { console.log('No synthetic rows to regen.'); return; }
  for (const r of synth) {
    const fullPath = join(ROOT, r.path);
    if (!fullPath.replace(/\\/g, '/').startsWith(join(ROOT, 'brains', 'synthetic').replace(/\\/g, '/'))) {
      throw new Error('Attempted to regen a non-synthetic path: ' + r.path);
    }
    // Future synthetic regeneration logic goes here
  }
  console.log('Regenerated', synth.length, 'synthetic fixtures.');
}

if (process.argv[1] && (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`)) {
  if (process.argv.includes('--init')) initManifest();
  else if (process.argv.includes('--check')) {
    try { checkManifest(false); } catch(e) { console.error(e.message); process.exit(1); }
  } else if (process.argv.includes('--regen')) {
    try { regenSynthetic(); } catch(e) { console.error(e.message); process.exit(1); }
  }
}