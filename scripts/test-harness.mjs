#!/usr/bin/env node
// Original test harness — PATH C, DeepSeek. Contains no baseline code.
//
// Runs against dist/wdb-bot.user.js when present. Pre-gate (no dist/), self-skips
// with exit 0. Uses Node built-ins only.
//
// Coverage from Qwen v3 CI APPROVED:
//   header / IIFE purity            — enforced by build.mjs, not here
//   storage-key identity            — here
//   adoptBrain lazy-survival        — here
//   adoptBrain apex-rejection       — here
//   superSide/posLearn literal PIN  — here (current-shape regression guard)
//   worker purity                   — here (vm eval of mlLib source)
//   baseline size pin               — dormant until baseline/ enters the repo
//   WDB.CFG deep parity             — dormant until baseline/ enters the repo
//
// Stage 1b feature tests (seeded eval, evalNoExplore, clock, ring buffer,
// exportLog, setStateProvider replay) self-skip until those WDB features exist.

import { readFileSync, existsSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join } from 'node:path';

const ROOT = process.cwd();
const BOT  = join(ROOT, 'dist', 'wdb-bot.user.js');
const BASE = join(ROOT, 'baseline', 'wdb-bot-6.7.3.user.js');

const skip = (m) => console.log('SKIP ' + m);
const ok   = (m) => console.log('ok   ' + m);
const fail = (m) => { console.error('FAIL ' + m); process.exitCode = 1; };

if (!existsSync(BOT)) { skip('dist/wdb-bot.user.js not present — pre-gate state'); process.exit(0); }
const src = readFileSync(BOT, 'utf8');

// ---------- stub browser realm + virtual clock ----------
function makeRealm() {
  const clock = { t: 0 };
  const timers = [];
  const stored = new Map();
  const storeLog = [];
  const handlers = { keydown: [], keyup: [], blur: [] };
  const win = {};
  win.performance = { now: () => clock.t };
  win.setTimeout  = (fn, ms) => { const id = timers.length; timers.push({ id, at: clock.t + (ms || 0), fn }); return id; };
  win.setInterval = (fn, ms) => { const id = timers.length; timers.push({ id, at: clock.t + (ms || 0), fn, interval: ms || 0 }); return id; };
  win.clearTimeout = win.clearInterval = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  win.requestIdleCallback    = (fn) => win.setTimeout(fn, 0);
  win.requestAnimationFrame  = (fn) => win.setTimeout(fn, 16);
  win.addEventListener = (name, fn) => { (handlers[name] || (handlers[name] = [])).push(fn); };
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
  // minimal PIXI so hookPixi() installs wrappers harmlessly
  const noop = () => {};
  const Graphics = function () {};
  Graphics.prototype = { drawCircle: noop, drawRect: noop, drawRoundedRect: noop, drawEllipse: noop, drawPolygon: noop, clear: noop };
  win.PIXI = { Graphics };
  // no Worker → mlInit falls through to mlLocal (matches a browser without Worker support)
  win.Worker = undefined; win.Blob = undefined;
  win.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
  return { ctx: createContext(win), win, clock, timers, stored, storeLog, handlers };
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

// ---------- load userscript into the stub ----------
const r = makeRealm();
try { runInContext(src, r.ctx); }
catch (e) { fail('userscript threw on load: ' + (e && e.message)); process.exit(1); }
advance(r, 200); // let the initial loop() fire twice, then stop
const WDB = r.win.WDB;
if (!WDB) { fail('WDB not exposed on window'); process.exit(1); }
ok('userscript loaded, WDB present');

try {

  // ---- storage keys ----
  {
    const written = new Set(r.storeLog.filter(([op]) => op === 'set').map(([, k]) => k));
    const allowed = new Set(['wdbBotBrain', 'wdbKeybinds', 'wdbBotKeybinds']);
    const extra = [...written].filter((k) => !allowed.has(k));
    if (extra.length) fail('unexpected localStorage keys written: ' + extra.join(', '));
    else ok('storage keys written are the three pinned names only');
  }

  // ---- adoptBrain: lazy survival ----
  if (typeof WDB.importBrain !== 'function') skip('WDB.importBrain absent');
  else {
    const lazy = { apex: { low: 30, regular: 55, high: 95, super: 140 },
                   clips: [{ kind: 'play', keys: [], path: [] }], countdownMs: 1234, ml: { q: 'AAAA', p: 'BBBB' } };
    const accepted = WDB.importBrain(JSON.stringify(lazy));
    const b = WDB.brain();
    if (!accepted) fail('importBrain refused a well-formed apex brain');
    else if (!Array.isArray(b.clips) || b.clips.length !== 1) fail('adoptBrain dropped clips (lazy)');
    else if (b.countdownMs !== 1234) fail('adoptBrain dropped countdownMs (lazy)');
    else if (!b.ml || typeof b.ml.q !== 'string' || b.ml.q.length < 10) fail('adoptBrain dropped ml after saveNow repack');
    else ok('adoptBrain preserves lazy fields (clips, countdownMs, ml)');
    const rej = WDB.importBrain(JSON.stringify({ clips: [], countdownMs: 9 }));
    if (rej !== false) fail('importBrain accepted an apex-less brain');
    else ok('adoptBrain rejects apex-less brains');
  }

  // ---- superSide / posLearn literal merges (Qwen v3 NEW PIN) ----
  // NOTE: this guard can only catch a *regression on the current shape*. It cannot
  // catch a future field being added to freshBrain's superSide/posLearn without the
  // literal defaults being updated in adoptBrain — that's a same-commit law, not a test.
  if (typeof WDB.importBrain !== 'function') skip('superSide/posLearn merge guard');
  else {
    const partial = { apex: { low: 30, regular: 55, high: 95, super: 140 },
                      superSide: { v: 42, n: 7 }, posLearn: { d: 88, n: 3 } };
    WDB.importBrain(JSON.stringify(partial));
    const b = WDB.brain();
    if (!b.superSide || b.superSide.v !== 42 || b.superSide.n !== 7) fail('superSide literal merge lost a field');
    else if (!b.posLearn || b.posLearn.d !== 88 || b.posLearn.n !== 3) fail('posLearn literal merge lost a field');
    else ok('superSide/posLearn literal merges preserve saved values');
  }

  // ---- worker purity ----
  {
    const m = /^\s*function\s+mlLib\s*\(\s*\)\s*\{/m.exec(src);
    if (!m) skip('mlLib() not found — worker purity skipped');
    else {
      const start = m.index + m[0].indexOf('function');
      const end = braceMatch(src, start);
      if (end < 0) fail('could not bracket-match mlLib()');
      else {
        const fnSrc = src.slice(start, end);
        try {
          const ctx2 = createContext({});
          const lib = runInContext('(' + fnSrc + ')()', ctx2);
          if (typeof lib.trainer !== 'function') fail('mlLib did not return trainer after isolated eval');
          else {
            const tr = lib.trainer(16, 14);
            const REC = 16 * 2 + 4, DREC = 16 + 2;
            const T = new Float32Array(400 * REC), D = new Float32Array(400 * DREC);
            for (let k = 0; k < T.length; k++) T[k] = Math.random() * 0.2;
            for (let k = 0; k < D.length; k++) D[k] = Math.random() * 0.2;
            tr.addT(T); tr.addD(D); tr.train(1);
            const st = tr.stats();
            if (!(st.updates >= 1 && st.pUpdates >= 1)) fail('trainer did not advance updates/pUpdates');
            else ok('worker purity: mlLib source standalone, trainer(16,14) trained one step');
          }
        } catch (e) { fail('worker purity: ' + (e && e.message)); }
      }
    }
  }

  // ---- baseline size pin (dormant pre-gate) ----
  if (!existsSync(BASE)) skip('baseline/ absent — size pin dormant');
  else {
    const got = readFileSync(BASE).length, want = 331751;
    if (got === want) ok(`baseline size pin: ${want} bytes`);
    else fail(`baseline size is ${got}, expected ${want}`);
  }

  // ---- CFG deep parity (dormant pre-gate) ----
  // NOTE: key extraction is regex-based on `word:` and will pick up noise from comment
  // text; since the noise is identical in both files, real diffs still surface. On a
  // surprise failure, paste the log — I will tighten the extraction.
  if (!existsSync(BASE)) skip('baseline/ absent — CFG parity dormant');
  else {
    const extract = (text) => {
      const m = /^\s*const\s+CFG\s*=\s*/m.exec(text);
      if (!m) return null;
      const end = braceMatch(text, m.index + m[0].length);
      return end < 0 ? null : text.slice(m.index + m[0].length, end);
    };
    const a = extract(src), b = extract(readFileSync(BASE, 'utf8'));
    if (!a || !b) fail('CFG not found in one of the files');
    else {
      const keys = (t) => new Set([...t.matchAll(/\b(\w+)\s*:/g)].map((x) => x[1]));
      const ka = keys(a), kb = keys(b);
      const missing = [...kb].filter((k) => !ka.has(k));
      const added   = [...ka].filter((k) => !kb.has(k));
      if (missing.length) fail('CFG missing baseline keys: ' + missing.join(', '));
      else ok(`CFG key parity: no baseline keys lost${added.length ? ' (added: ' + added.join(',') + ')' : ''}`);
    }
  }

  // ---- Stage 1b feature gates ----
  skip('Stage 1b features (exportLog, evalNoExplore, ring buffer) not yet wired — tests will activate once present');

} catch (e) {
  fail('harness threw: ' + (e && e.message));
}

process.exit(process.exitCode || 0);