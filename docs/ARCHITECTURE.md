# WDB Bot PhD — System Architecture & Engineering Pins

## 1. Project Scope, Stack & Permission Gate

- **Mission:** Evolve *"WDB Bot (practice)"* (v6.7.3, GreasyFork script `598200`) into a standalone Bonk.io WeiRd DeAth BalL bot targeting map `dbid 80622`.
- **Operational Scope:** Private rooms and practice only.
- **Zero-Spend Stack:**
  - Editing & repo management: GitHub Web UI / `github.dev`
  - Build & CI verification: GitHub Actions free tier (`ubuntu-latest`, Node.js built-ins only, zero paid services or Codespaces)
  - Runtime & manual verification: Chrome + Tampermonkey
- **Third-Party Code Gate:** The baseline script is third-party work by GreasyFork author **Bobby Xq**. **No baseline code or derivative runtime source enters this repository, and nothing is redistributed, until written permission is received.** Until then, only original documentation, build tooling, CI workflows, and test scaffolding live in the repo.

---

## 2. Hard Runtime, Header & Storage Pins

All items below are non-negotiable Stage 0 invariants:

1. **Userscript Metadata Block (verbatim):**
   - `@match https://bonk.io/gameframe-release.html*`
   - `@run-at document-start`
   - `@grant none`
   - **Zero `GM_*` grants allowed.** Any grant other than `@grant none` activates Tampermonkey sandbox isolation, separating `localStorage` from the page context and silently losing saved brains and keybinds.
2. **Script Packaging:** Plain non-module immediately-executed function expression (IIFE) running directly in page scope. No ES module `import`/`export` syntax, no `require`, and no bundler shims (Webpack/Rollup/Babel helpers break `mlLib.toString()` inside the Web Worker).
3. **Page `localStorage` Keys (verbatim):**
   - `wdbKeybinds` — user control bindings and hotkey overrides (`toggleKey`, `teachKey`, `panelKey`).
   - `wdbBotKeybinds` — separate bot output bindings (`BOT_KEYS`), stored **diff-only** (only controls whose key `code` differs from `KEYS` are written; `BOT_KEYS` falls back to `KEYS` for any omitted control).
   - `wdbBotBrain` — persistent learned state and neural weights (`Q` and `P` packed via base64).
4. **Unbound Default State:** Startup initializes all six movement/action controls in `KEYS` to `null` (`noKeys() === true`). The bot presses nothing and Teaching reads nothing until the user binds keys via `F6` (or `F5` for bot-only keys).
5. **Runtime Behavioral Pins:**
   - **Countdown key re-press cadence:** Re-sends `keydown` every `50 ms` while `!ML.live` or `< 600 ms` post-live in ML mode; every `300 ms` (`CFG.keyRefreshMs`) otherwise.
   - **Teaching override:** `F3` (`CFG.teachKey`) forces `mlTick` execution even when `CFG.ml === false`.
   - **Dead / spectating observation:** Input inference, opponent/teammate watchers, and ML demo collection continue running while the player is dead/spectating inside a visible match root (`lastRoot`).
   - **ML exploration schedule:** `mlEps` decays from `0.3` toward `0.04` with a half-life of **60,000 decisions** (step counter `brain.ml.steps`, not milliseconds).
   - **Double-DQN target sync:** Target network `T` copies weights from `Q` every **500** gradient updates inside `mlLib.trainer`.

---

## 3. Safety Scope, Dead-Code & `CFG` Parity Pins

- **Safety Layer Scope (verbatim rule):**
  > safetyLayer runs only on the planner/legacy brain's keys (single call site, botTick L5571, after the ML/teach early-return at L5546); the ML brain and teaching mode bypass it.
  - Never unify `safetyLayer` across the ML and legacy/planner brains. Within legacy `decide()`, `safetyLayer` also skips `THROW` mode, balls on a distant opponent rope (`> 160`), and trusted `WAIT_JUMP` holds (`planHold`).
- **Confirmed Dead Functions (keep dead in Stage 0):**
  - `findBonkBinds` (baseline definition `L600`): zero call sites or references anywhere (including strings, bracket notation, and `window.WDB`). Do not wire it in.
  - `drawOverlay` (baseline definition `L5328`): zero call sites or references anywhere, not exposed on `window.WDB` (`WDB.showMap()` only toggles `CFG.showMap`). Do not wire it in during Stage 0; any future Stage 2+ map overlay wiring must be strictly opt-in behind a new `CFG` flag.
- **Unused `CFG` Keys:** `aimY` (`250`), `grabIdeal` (`75`), and `maxCarryMs` (`2500`) have no active runtime consumers in v6.7.3 and must remain present verbatim in `CFG`.
- **`CFG` Default Authority:** `setupPlay: false` is recorded as a documentation value. **CI deep parity against the frozen baseline file is the sole authority**—if the frozen baseline differs on any `CFG` key or default, update the documentation to match, never alter Stage 0 code.

---

## 4. Brain-Compatibility Law

1. **`adoptBrain` Verbatim Rule:** In Stage 0 and all backward-compatible releases, `adoptBrain(saved)` must be preserved **verbatim**—never rewritten and never converted into an allowlist/whitelist:
   - Rejects saves missing `saved.apex` (`if (!saved || !saved.apex) return false`).
   - Performs top-level `Object.assign(freshBrain(), saved)` passthrough so lazy runtime properties (`clips`, `countdownMs`, `ml`, etc.) survive intact.
   - Performs explicit nested fresh-default merges for `lift`, `air`, `move`, `superSide`, `review`, `map`, `targets`, `copyStats`, `posLearn`, and `airMoves`.
   - Applies `Array.isArray` type guards for `plays`, `defMoves`, `kickMoves`, and `knn`.
   - Calls `sanitizeJumps()` in a `try/catch`.
2. **Literal-Target Sub-object Pin:** In baseline `adoptBrain`, `superSide` and `posLearn` merge into **literal** target objects (`{ v: 0, n: 0 }` and `{ d: null, n: 0 }`) rather than `freshBrain().superSide` / `freshBrain().posLearn`. Adding new default fields for those two sub-objects only inside `freshBrain()` would silently drop during `adoptBrain`. Never add defaults to those literals without a synchronized same-commit update; prefer additive top-level fields elsewhere.
3. **Versioned Forward Evolution:** Any Stage 2+ experiment that alters ML observation dimensions (`ML_IN`), action sets (`ML_ACTIONS`), network topology, or incompatible weight semantics must be gated behind an opt-in `CFG` flag and a versioned brain schema (e.g., `brain.version = 2` / isolated weight key) so `v1` saved brains load cleanly forever.
4. **Regression Fixtures:** Aethy's existing exported `wdb-brain-*.json` files serve as Stage 0 regression fixtures verified in CI against `adoptBrain` and `mlInit`.

---

## 5. Repository & Module Split Design

### Pre-Gate Layout (Safe Before Permission)
- `docs/ARCHITECTURE.md` — this architecture specification
- `docs/FEATURE-INVENTORY.md` — complete feature contract (`INP`–`SYS`)
- `docs/LICENSING-PLAN.md` — attribution, gate rules, and permission decision matrix
- `scripts/build.mjs` — zero-dependency Node.js ordered assembler (uses only `fs` and `path`)
- `scripts/test-harness.mjs` — zero-dependency Node.js test & deterministic replay runner
- `.github/workflows/ci.yml` — GitHub Actions CI pipeline (parity assertions stay dormant until `baseline/` exists)
- `brains/` — optional fixture manifest / anonymized test brains provided by owner

### Post-Gate Layout (Unlocked Only After Written Permission)
- `baseline/WDB Bot (practice).user.js` — frozen read-only reference copy (`5,824` lines / `331,751` bytes)
- `src/` — modular ordered source slices assembled inside the single outer IIFE:
  - `src/00-header.js` — userscript metadata header + `'use strict'` IIFE opening
  - `src/01-config-binds.js` — `CFG`, `KEYS`, `BOT_KEYS`, keybind UI & storage
  - `src/02-perception.js` — `hookPixi`, `readState`, `findBall`, `buildMap`, `scanMap`
  - `src/03-physics-radar.js` — `field`, `simFlight`, `ballFlight`, `learnBounces`, `radar`, `updateFuel`, `safetyLayer`
  - `src/04-ml-lib.js` — **pure self-contained `mlLib` with zero external closures or helper imports** so `mlLib.toString()` executes safely inside the `Blob` Web Worker
  - `src/05-ml-brain.js` — `ML`, `mlInit`, `mlLocal`, `mlFeatures`, `mlDecide`, `mlTick`, `mlRoundLive`, `mlPanel`
  - `src/06-teaching.js` — `mlTape`, `mlSaveClip`, `mlPickKickoff`, `mlPickPlay`, `mlReplayStep`, `mlVerdict`
  - `src/07-planner-rules.js` — `planSave`, `mpcMove`, `cloneSuggest`, `planRelease`, `decide`, `stance`, `readSwing`
  - `src/08-observers.js` — movement/input readers, watchers, `reviewTick`, `grabClockTick`, `passTick`, `kickoffTick`
  - `src/09-ui-api-loop.js` — `render`, `makeButtons`, `drawOverlay`, `exportBrain`/`importBrain`, `botTick`, `loop`, `window.WDB`, IIFE closing
- `dist/wdb-bot.user.js` — single compiled installable userscript produced by `scripts/build.mjs`

### Private Install Workflow (Zero Local Dev Tools)
- GitHub Actions runs `scripts/build.mjs` and `scripts/test-harness.mjs` on every push/PR, uploading `dist/wdb-bot.user.js` as a downloadable Workflow Artifact (and optionally pushing `dist/wdb-bot.user.js` to a `dist` branch for signed-in **Raw** access in Chrome + Tampermonkey).

---

## 6. CI Verification Contract

`scripts/test-harness.mjs` enforces the following checks (dormant parity checks activate automatically once `baseline/` is present):

1. **Header & IIFE Purity:** Assert `dist/wdb-bot.user.js` begins with the exact `@match`, `@run-at document-start`, and `@grant none` tags, contains zero `GM_*` grants, and wraps all code in a plain non-module IIFE (no `import`/`export`/`require` module syntax).
2. **Storage-Key Identity & `adoptBrain` Contract:** Assert presence of exact literals `'wdbKeybinds'`, `'wdbBotKeybinds'`, and `'wdbBotBrain'`. Run automated unit tests verifying lazy-field survival (`clips`, `countdownMs`, `ml`) and rejection of saves lacking `apex`.
3. **Worker-Source Purity:** Extract `mlLib.toString()` from the built script, reject any external closure leaks or bundler shims, evaluate `const lib = (<mlLib>)(); const tr = lib.trainer(16, 14);` inside an isolated Node `vm` context, and run at least one `stepQ` and one `stepP` update cleanly.
4. **Baseline File Pin (Post-Gate):** Verify frozen `baseline/WDB Bot (practice).user.js` matches `5,824` lines and `331,751` bytes.
5. **`WDB.CFG` Deep Parity (Post-Gate):** Evaluate both `baseline/` and `dist/wdb-bot.user.js` in a sandboxed harness and assert deep equality of `Object.keys(WDB.CFG)` and every default value.

---

## 7. Staged Development Roadmap

One relay round per stage; every stage leaves a working installable `.user.js`:

- **Stage 0 — Structure & Parity Build (Permission-Gated):**
  - Commit frozen `baseline/`, split into `src/00..09`, assemble `dist/wdb-bot.user.js` via `scripts/build.mjs`, pass all CI parity checks with zero behavior change, and pass Aethy's Chrome/Tampermonkey private-room smoke check (`WDB.errors.count === 0`).
- **Stage 1 — Decision Log & Seeded Replay Harness:**
  - **Opt-in Seeded Eval Mode:** Add `CFG.evalSeed` (`null` by default -> unchanged `Math.random()`) routing all stochastic calls (`mlDecide` exploration/sampling, clip selection, legacy exploration, `throwJitter`, `willFake`, stance/delay selection, `learnClone` random eviction, and `mlLib` init/sampling) through a deterministic PRNG when set; add `CFG.evalNoExplore` (`false` by default) to disable exploration/jitter/fakes; support deterministic clock injection (`performance.now`/`Date.now` override) in the harness.
  - **Decision Log Ring Buffer & Explicit Export:** Bounded in-memory ring buffer (`CFG.logDecisions = false`, `CFG.logCapacity = 2000`) recording tick index, timestamp, PRNG state, mode, state/features, action/keys, and rewards/verdicts—with **zero silent file writes** and zero `localStorage` spam. Add an explicit **Export Log** button and `WDB.exportLog()` JSON download.
  - **Offline Deterministic Replay Runner:** Replay exported or synthetic state traces via `WDB.setStateProvider` in Node CI and assert 100% reproducible decisions and RNG state.
- **Stage 2+ — Opt-in Measured Experiments (Target: Bonk.io Map `dbid 80622`):**
  - **Stage 2 Calibration Priority:** **1v1 private rooms** on map `dbid 80622`. Capture real physics, net geometry, bounce/friction, and spawn measurements via Stage 1 logs; add opt-in debug overlay flag (`CFG.mapDebugOverlay`, preserving `drawOverlay` dead-by-default) and build an offline evaluation benchmark suite.
  - **Stage 3+ Brain v2 Experiments:** Develop opt-in versioned `v2` observation/action/reward/curriculum improvements tested quantitatively against Stage 1 deterministic benchmarks and live practice win/save metrics without breaking `v1` brain loading.