#!/usr/bin/env node
// Original test harness — PATH C, DeepSeek. Contains no baseline code.
//
// Qwen v6:
//   • skip is keyed ONLY on src/ absence; any skip once src/ exists is a failure
//     (except baseline-parity skips, permitted while baseline/ is un-committed)
//   • worker-purity bar = boundary (a): fresh empty vm realm proves mlLib captures
//     NO main-script scope; its only global usage is standard intrinsics
//     (currently Math, Float32Array), which any Worker realm provides
//   • build laws L-a, L-b, L-c, L-d (harness-observable), L-e, L-f enforced below
//
// Pre-gate (src/ absent) exits 0 with a loud banner. That is NOT a green signal
// for the bot — it only confirms pre-gate state.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC  = join(ROOT, 'src');
const DIST = join(ROOT, 'dist', 'wdb-bot.user.js');
const BASE = join(ROOT, 'baseline', 'wdb-bot-6.7.3.user.js');

// -------- L-f: pre-gate skip keyed ONLY on src/ absence --------
if (!existsSync(SRC)) {
  console.log('=======================================================');
  console.log('PRE-GATE: PARITY DORMANT');
  console.log('  reason: src/ absent — nothing to assemble or test');
  console.log('  run=0  pass=0  fail=0  skip=all');
  console.log('  NOT a green signal for the bot.');
  console.log('=======================================================');
  process.exit(0);
}
if (!existsSync(DIST)) {
  console.error('FAIL src/ exists but dist/wdb-bot.user.js does not — build must run first');
  process.exit(1);
}

const botSrc = readFileSync(DIST, 'utf8');
const headEnd = botSrc.indexOf('// ==/UserScript==');
const botHead = headEnd >= 0 ? botSrc.slice(0, headEnd + '// ==/UserScript=='.length) : '';

let passN = 0, failN = 0, skipN = 0;
const skipReasons = [];
const ok   = (m) => { passN++; console.log('ok   ' + m); };
const bad  = (m) => { failN++; console.error('FAIL ' + m); };
const skp  = (m, why) => { skipN++; skipReasons.push(m + ' (' + why + ')'); console.log('SKIP ' + m + ' — ' + why); };

// -------- stub browser realm + virtual clock --------
function makeRealm() {
  const clock = { t: 0 };
  const timers = [];
  const stored = new Map();
  const storeLog = [];
  const win = {};
  win.performance = { now: () => clock.t };
  win.setTimeout  = (fn, ms) => { const id = timers.length; timers.push({ id, at: clock.t + (ms || 0), fn }); return id; };
  win.setInterval = (fn, ms) => { const id = timers.length; timers.push({ id, at: clock.t + (ms || 0), fn, interval: ms || 0 }); return id; };
  win.clearTimeout = win.clearInterval = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  win.requestIdleCallback   = (fn) => win.setTimeout(fn, 0);
  win.requestAnimationFrame = (fn) => win.setTimeout(fn, 16);
  win.addEventListener = () => {};
  win.localStorage = {
    getItem:    (k) => { storeLog.push(['get', k]); return stored.has(k) ? stored.get(k) : null; },
    setItem:    (k, v) => { storeLog.push(['set', k]); stored.set(k, String(v)); },
    removeItem: (k) => { storeLog.push(['rm', k]); stored.delete(k); },
    get length() { return stored.size; },
    key: (i) => [...stored.keys()][i] ?? null,
  };
  win.document = {
    body: null,
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, click() {} }),
    addEventListener: () => {},
    createEvent: () => ({ initEvent() {} }),
  };
  win.window = win;
  win.console = console;
  // btoa/atob stubs — without these, mlSave silently throws, saveNow catches, and
  // brain.ml.q stays unset. The wire-size pin below would then fail for the wrong reason.
  win.btoa = (bin) => Buffer.from(bin, 'binary').toString('base64');
  win.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
  const noop = () => {};
  const Graphics = function () {};
  Graphics.prototype = { drawCircle: noop, drawRect: noop, drawRoundedRect: noop, drawEllipse: noop, drawPolygon: noop, clear: noop };
  win.PIXI = { Graphics };
  win.Worker = undefined; win.Blob = undefined;
  win.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
  return { ctx: createContext(win), win, clock, timers, stored, storeLog };
}
function advance(r, ms) {
  const end = r.clock.t + ms;
  for (;;) {
    r.timers.sort((a, b) => a.at - b.at);
    const t = r.timers[0];
    if (!t || t.at > end) break;
    r.clock.t = t.at;
    if (t.interval > 0) t.at = r.clock.t + t.interval; else r.timers.shift();
    try { t.fn(); } catch (e) { console.error('timer threw:', e && e.message); }
  }
  r.clock.t = end;
}
function braceMatch(text, fromIdx) {
  let i = text.indexOf('{', fromIdx), depth = 0;
  if (i < 0) return -1;
  while (i < text.length) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return -1;
}
const deepContains = (hay, needle) => {
  if (needle === null || typeof needle !== 'object') return hay === needle;
  if (Array.isArray(needle)) return Array.isArray(hay) && needle.every((v, i) => deepContains(hay[i], v));
  return hay && typeof hay === 'object' && Object.keys(needle).every((k) => deepContains(hay[k], needle[k]));
};

// -------- static checks on dist --------

// Header pins
try {
  for (const p of ['@match        https://bonk.io/gameframe-release.html*',
                   '@run-at       document-start',
                   '@grant        none']) {
    if (!botHead.includes(p)) throw new Error('header missing: ' + p);
  }
  ok('header pins: @match / @run-at / @grant none present verbatim');
} catch (e) { bad(e.message); }

// L-c: no GM_ token anywhere in dist (comments included — law is zero-tolerance)
try {
  const m = /\bGM_[A-Za-z]/.exec(botSrc);
  if (m) throw new Error('GM_ token present in dist near: ' + botSrc.slice(Math.max(0, m.index - 40), m.index + 40));
  ok('L-c: no GM_ token in dist');
} catch (e) { bad(e.message); }

// L-b: no localStorage.clear
try {
  if (/localStorage\s*\.\s*clear\s*\(/.test(botSrc)) throw new Error('localStorage.clear present in dist');
  ok('L-b: no localStorage.clear in dist');
} catch (e) { bad(e.message); }

// L-a: storage keys literal / bare-identifier only (no concatenation, no computed keys)
try {
  const srcFiles = readdirSync(SRC).filter((n) => /\.js$/.test(n));
  if (!srcFiles.length) throw new Error('src/ contains no .js files');
  const srcAll = srcFiles.map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n');
  for (const k of ['wdbBotBrain', 'wdbKeybinds', 'wdbBotKeybinds']) {
    if (!srcAll.includes("'" + k + "'") && !srcAll.includes('"' + k + '"')) {
      throw new Error(`pinned storage key "${k}" not present as a string literal in src`);
    }
  }
  const callRe = /localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/g;
  let m;
  while ((m = callRe.exec(srcAll))) {
    let depth = 0, i = m.index + m[0].length;
    const start = i;
    while (i < srcAll.length) {
      const c = srcAll[i];
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
      i++;
    }
    const arg = srcAll.slice(start, i).trim();
    if (!/^['"`][^'"`]*['"`]$/.test(arg) && !/^[A-Za-z_$][\w$]*$/.test(arg)) {
      throw new Error('storage key call has non-literal argument: ' + arg);
    }
  }
  ok('L-a: storage keys are literal/bare-identifier only, no concatenation');
} catch (e) { bad(e.message); }

// L-d (harness-observable): every src file matches NN-*.js; every matching file's content is in dist
try {
  const srcFiles = readdirSync(SRC);
  const orphans = srcFiles.filter((n) => !/^\d\d-.+\.js$/.test(n));
  if (orphans.length) throw new Error('src file(s) not matching ^\\d\\d-.+\\.js$: ' + orphans.join(', '));
  const matched = srcFiles.filter((n) => /^\d\d-.+\.js$/.test(n)).sort();
  if (matched.length < 2) throw new Error('need >= 2 ordered parts; got ' + matched.join(', ') || '(none)');
  const missing = matched.filter((f) => !botSrc.includes(readFileSync(join(SRC, f), 'utf8')));
  if (missing.length) throw new Error('part(s) not present in dist (build dropped them): ' + missing.join(', '));
  ok(`L-d: all ${matched.length} src part(s) present in dist, no orphans`);
} catch (e) { bad(e.message); }

// -------- runtime tests against a loaded userscript --------
const r = makeRealm();
let loadErr = null;
try { runInContext(botSrc, r.ctx); } catch (e) { loadErr = e; }
if (loadErr) bad('userscript threw on load: ' + loadErr.message);
else {
  advance(r, 200);
  const WDB = r.win.WDB;
  if (!WDB) bad('WDB not exposed on window');
  else {
    ok('userscript loaded, WDB present');

    // Storage write-set: subset of the three pinned names only
    try {
      const written = new Set(r.storeLog.filter(([op]) => op === 'set').map(([, k]) => k));
      const allowed = new Set(['wdbBotBrain', 'wdbKeybinds', 'wdbBotKeybinds']);
      const extra = [...written].filter((k) => !allowed.has(k));
      if (extra.length) throw new Error('unexpected localStorage keys written: ' + extra.join(', '));
      ok('storage writes: subset of the three pinned keys only');
    } catch (e) { bad(e.message); }

    // adoptBrain: lazy survival
    try {
      const lazy = { apex: { low: 30, regular: 55, high: 95, super: 140 },
                     clips: [{ kind: 'play', keys: [], path: [] }], countdownMs: 1234, ml: { q: 'AAAA', p: 'BBBB' } };
      if (!WDB.importBrain(JSON.stringify(lazy))) throw new Error('importBrain refused a well-formed apex brain');
      const b = WDB.brain();
      if (!Array.isArray(b.clips) || b.clips.length !== 1) throw new Error('adoptBrain dropped clips (lazy)');
      if (b.countdownMs !== 1234) throw new Error('adoptBrain dropped countdownMs (lazy)');
      if (!b.ml || typeof b.ml.q !== 'string') throw new Error('adoptBrain dropped ml');
      ok('adoptBrain preserves lazy fields (clips, countdownMs, ml)');
    } catch (e) { bad(e.message); }

    // adoptBrain: apex gate depth (no deeper)
    try {
      if (WDB.importBrain(JSON.stringify({ clips: [], countdownMs: 9 })) !== false) throw new Error('accepted apex-less brain');
      if (WDB.importBrain(JSON.stringify({ data: 1 })) !== false) throw new Error('accepted {data:1}');
      if (WDB.importBrain(JSON.stringify({ apex: {} })) !== true) throw new Error('rejected {apex:{}} — should pass the gate');
      ok('adoptBrain apex-gate depth: {} and {data:1} rejected, {apex:{}} accepted');
    } catch (e) { bad(e.message); }

    // superSide / posLearn literal-target guard
    try {
      const partial = { apex: { low: 30, regular: 55, high: 95, super: 140 },
                        superSide: { v: 42, n: 7 }, posLearn: { d: 88, n: 3 } };
      if (!WDB.importBrain(JSON.stringify(partial))) throw new Error('import rejected');
      const b = WDB.brain();
      if (!b.superSide || b.superSide.v !== 42 || b.superSide.n !== 7) throw new Error('superSide literal merge lost a field');
      if (!b.posLearn || b.posLearn.d !== 88 || b.posLearn.n !== 3) throw new Error('posLearn literal merge lost a field');
      ok('superSide/posLearn literal-target merges preserve saved values');
    } catch (e) { bad(e.message); }

    // Wire-size pin (provisional per Qwen: mismatch -> fix pin, not code)
    try {
      if (!WDB.importBrain(JSON.stringify({ apex: { low: 30, regular: 55, high: 95, super: 140 } })))
        throw new Error('import rejected');
      const b = WDB.brain();
      if (!b.ml || typeof b.ml.q !== 'string' || typeof b.ml.p !== 'string')
        throw new Error('brain.ml.q/p not set after importBrain+saveNow (btoa/atob stubs missing?)');
      if (b.ml.q.length !== 32844) throw new Error(`brain.ml.q wire-size ${b.ml.q.length}, expected 32844`);
      if (b.ml.p.length !== 32844) throw new Error(`brain.ml.p wire-size ${b.ml.p.length}, expected 32844`);
      ok('wire-size pin: brain.ml.q and brain.ml.p are both 32,844 base64 chars');
    } catch (e) { bad(e.message); }

    // Worker purity — boundary (a)
    // mlLib references no main-script scope; its only global usage is standard
    // intrinsics (currently Math, Float32Array), which any Worker realm provides.
    try {
      const m = /^\s*function\s+mlLib\s*\(\s*\)\s*\{/m.exec(botSrc);
      if (!m) throw new Error('mlLib() not found (renamed or removed)');
      const start = m.index + m[0].indexOf('function');
      const end = braceMatch(botSrc, start);
      if (end < 0) throw new Error('could not bracket-match mlLib()');
      const fnSrc = botSrc.slice(start, end);
      const lib = runInContext('(' + fnSrc + ')()', createContext({}));
      if (typeof lib.trainer !== 'function') throw new Error('mlLib did not return trainer');
      const tr = lib.trainer(16, 14);
      const REC = 16 * 2 + 4, DREC = 16 + 2;
      const T = new Float32Array(400 * REC), D = new Float32Array(400 * DREC);
      for (let k = 0; k < T.length; k++) T[k] = Math.random() * 0.2;
      for (let k = 0; k < D.length; k++) D[k] = Math.random() * 0.2;
      tr.addT(T); tr.addD(D); tr.train(1);
      const st = tr.stats();
      if (!(st.updates >= 1 && st.pUpdates >= 1)) throw new Error('trainer did not advance updates/pUpdates');
      ok('worker purity (boundary a): mlLib standalone in empty realm, trainer(16,14) trained one step');
    } catch (e) { bad('worker purity: ' + e.message); }

    // Round-trip deep-contains, excluding apex/lift/air (which sanitizeJumps may clamp)
    try {
      const fixture = {
        apex: { low: 35, regular: 60, high: 100, super: 150 },
        lift: { low: 55, regular: 130, high: 210, super: 220 },
        air:  { low: 420, regular: 560, high: 760, super: 900 },
        someCustomField: { nested: [1, 2, 3], flag: true },
        clips: [{ kind: 'play', keys: [[0, 0]], path: [[0, 10, 20]] }],
        countdownMs: 3000,
      };
      if (!WDB.importBrain(JSON.stringify(fixture))) throw new Error('import rejected');
      const out = JSON.parse(WDB.exportBrain(false));
      const f2 = JSON.parse(JSON.stringify(fixture)), o2 = JSON.parse(JSON.stringify(out));
      delete f2.apex; delete f2.lift; delete f2.air;
      delete o2.apex; delete o2.lift; delete o2.air;
      if (!deepContains(o2, f2)) throw new Error('round-trip did not deep-contain fixture (excluding apex/lift/air)');
      for (const t of ['low', 'regular', 'high', 'super']) {
        if (!(out.lift[t] >= 40 && out.lift[t] <= 300)) throw new Error(`lift.${t} = ${out.lift[t]} outside [40,300]`);
      }
      const order = ['low', 'regular', 'high', 'super'];
      const apexGap = { regular: 8, high: 12, super: 25 };
      for (let i = 1; i < order.length; i++) {
        const t = order[i], p = order[i - 1];
        if (!(out.apex[t] >= out.apex[p] + apexGap[t])) throw new Error(`apex gap ${p}->${t} violated`);
        if (!(out.air[t] >= out.air[p] + 30)) throw new Error(`air gap ${p}->${t} violated`);
      }
      ok('round-trip: deep-contains fixture (excluding apex/lift/air); sanitize invariants hold');
    } catch (e) { bad(e.message); }

    // Synthetic old-save variants: 9 field-deleted clones of a valid brain
    try {
      const valid = { apex: { low: 30, regular: 55, high: 95, super: 140 },
                      lift: { low: 60, regular: 120, high: 200, super: 200 },
                      air:  { low: 400, regular: 550, high: 750, super: 900 },
                      someCustomField: 'sentinel' };
      if (!WDB.importBrain(JSON.stringify(valid))) throw new Error('baseline import rejected');
      const full = JSON.parse(WDB.exportBrain(false));
      for (const field of ['posLearn','superSide','airMoves','ml','clips','countdownMs','knn','passes','holds']) {
        const copy = JSON.parse(JSON.stringify(full));
        delete copy[field];
        if (!WDB.importBrain(JSON.stringify(copy))) throw new Error(`import rejected after deleting ${field}`);
        if (!WDB.brain().apex) throw new Error(`brain.apex missing after deleting ${field}`);
      }
      ok('synthetic old-save variants: 9 field-deleted clones import cleanly');
    } catch (e) { bad(e.message); }
  }
}

// -------- baseline parity (dormant unless baseline/ present) --------
if (!existsSync(BASE)) {
  skp('CFG deep parity', 'baseline/ absent — pre-gate');
  skp('baseline size pin', 'baseline/ absent — pre-gate');
} else {
  try {
    const bbase = readFileSync(BASE, 'utf8');
    if (bbase.length !== 331751) throw new Error(`baseline size ${bbase.length}, expected 331751`);
    ok('baseline size pin: 331,751 bytes');
  } catch (e) { bad(e.message); }
  try {
    const extract = (text) => {
      const m = /\n[ \t]*const\s+CFG\s*=\s*\{/.exec(text);
      if (!m) return null;
      const end = braceMatch(text, m.index + m[0].length - 1);
      return end < 0 ? null : text.slice(m.index, end);
    };
    const a = extract(botSrc), b = extract(readFileSync(BASE, 'utf8'));
    if (!a || !b) throw new Error('CFG not found in one of the files');
    const ka = new Set([...a.matchAll(/\b(\w+)\s*:/g)].map((x) => x[1]));
    const kb = new Set([...b.matchAll(/\b(\w+)\s*:/g)].map((x) => x[1]));
    const missing = [...kb].filter((k) => !ka.has(k));
    if (missing.length) throw new Error('CFG missing baseline keys: ' + missing.join(', '));
    ok('CFG key parity: no baseline keys lost');
  } catch (e) { bad(e.message); }
}

// -------- L-f: skip discipline --------
const nonBaselineSkips = skipReasons.filter((r) => !r.startsWith('CFG deep parity') && !r.startsWith('baseline size pin'));
if (nonBaselineSkips.length) bad('L-f violation: skips present while src/ exists: ' + nonBaselineSkips.join('; '));

console.log(`RESULT pass=${passN} fail=${failN} skip=${skipN}`);
if (passN === 0 && failN === 0) { console.error('L-f violation: src/ exists but 0 tests ran'); process.exit(1); }
process.exit(failN > 0 ? 1 : 0);
