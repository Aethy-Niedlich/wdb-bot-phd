# WDB Bot PhD — System Architecture & Engineering Pins

## 1. Project Scope, Stack & Permission Gate

- **Mission:** Evolve *"WDB Bot (practice)"* (v6.7.3, GreasyFork script `598200`) into a standalone Bonk.io WeiRd DeAth BalL bot targeting map `dbid 80622`.
- **Operational Scope:** Private rooms and practice only.
- **Zero-Spend Stack:**
  - Editing & repo management: GitHub Web UI / `github.dev`
  - Build & CI verification: GitHub Actions free tier (`ubuntu-latest`, Node.js built-ins only, zero paid services or Codespaces)
  - Runtime & manual verification: Chrome + Tampermonkey
- **Third-Party Code Gate:** The baseline script is third-party work by GreasyFork author **Bobby Xq**. **No baseline code or derivative runtime source (`src/`, `baseline/`) enters this repository, and nothing is redistributed, until written permission is received.** Pre-gate CI runs fixture-integrity and original-script self-checks only.
- **Toolchain Honesty:** Original build/harness/workflow files (`scripts/build.mjs`, `scripts/test-harness.mjs`, `.github/workflows/ci.yml`, `.gitignore`) use zero external bundlers and are awaiting code-level verification and their first CI run. Nothing in documentation may claim "CI green" until a real post-gate CI run passes.

---

## 2. Hard Runtime, Header & Storage Pins

All items below are non-negotiable Stage 0 invariants:

1. **Userscript Metadata Block (verbatim):**
   - `@match https://bonk.io/gameframe-release.html*`
   - `@run-at document-start`
   - `@grant none`
   - **Zero `GM_*` grants allowed.** Any grant other than `@grant none` activates Tampermonkey sandbox isolation, separating `localStorage` from page scope and silently losing saved brains and keybinds.
2. **Script Packaging:** Plain non-module immediately-executed function expression (IIFE) running directly in page scope. No ES module `import`/`export` syntax, no `require`, and no bundler shims (Webpack/Rollup/Babel helpers break Worker serialization of `mlLib`).
3. **Page `localStorage` Keys (verbatim):**
   - `wdbKeybinds` — user control bindings and hotkey overrides (`toggleKey`, `teachKey`, `panelKey`).
   - `wdbBotKeybinds` — separate bot output bindings (`BOT_KEYS`), stored **diff-only** (only controls whose key code differs from user `KEYS` are stored; missing controls fall back to `KEYS`).
   - `wdbBotBrain` — persistent learned state and neural weights (`Q` and `P` serialized via base64).
4. **Hotkeys & Unbound Default State:**
   - Valid hotkeys are strictly **`F2`** (toggle bot), **`F3`** (Teaching mode, forces `mlTick` even when `CFG.ml` is disabled), **`F4`** (full/compact panel), **`F5`** (bot-only keybinds), and **`F6`** (user keybinds). **No `F7` hotkey exists.**
   - Startup initializes all six movement/action controls in `KEYS` as unset (`null`). The bot presses nothing and Teaching reads nothing until the user binds keys via `F6` (or `F5` for bot-only keys).
5. **Runtime Behavioral Pins:**
   - **Countdown key re-press cadence:** Re-sends `keydown` every `50 ms` while waiting for live round start or during the first `600 ms` post-live in ML mode; every `300 ms` (`keyRefreshMs`) otherwise.
   - **Dead / spectating observation:** Input inference, player watchers, and ML demo collection continue running while the player is dead/spectating inside a visible match root.
   - **ML exploration schedule:** Exploration rate decays toward `0.04` with a half-life of **60,000 decisions** (decision step count, not milliseconds).
   - **Double-DQN target sync:** Target network copies weights from the online Q network every **500** gradient updates.

---

## 3. Safety Scope, Dead-Code & `CFG` Parity Pins

- **Safety Layer Scope (verbatim repo wording):**
  > safetyLayer runs only on the planner/legacy brain's keys; its single call site sits after the ML/teach early-return in the main tick; ML and teaching bypass it.
  - Never unify `safetyLayer` across the ML and legacy/planner brains.
- **Confirmed Dead Functions & Commands (keep dead in Stage 0):**
  - `findBonkBinds`: dead helper with zero active call sites or references anywhere in the runtime; keep dead.
  - `drawOverlay`: dead rendering helper with zero active call sites and not exposed on `window.WDB`; keep dead in Stage 0.
  - `showMap`: live setter, dead read path — command exists, effect does not. (Any future Stage 2+ visual map overlay must be strictly opt-in behind a new `CFG` flag.)
- **Unused `CFG` Keys:** `aimY`, `grabIdeal`, and `maxCarryMs` have no active runtime consumers in v6.7.3 and must remain present verbatim in `CFG`.
- **`CFG` Default Authority:** Documented values (such as `setupPlay: false`) are documentation records only. **CI deep parity against the frozen baseline file is the sole authority**—if the baseline differs on any `CFG` key or default, update documentation to match, never alter Stage 0 code.

---

## 4. Brain-Compatibility Law & Fixture Provenance

1. **`adoptBrain` Verbatim Law:** `adoptBrain` must be preserved verbatim in Stage 0—never rewritten and never converted into an allowlist/whitelist:
   - Rejects saves missing a truthy `apex` property, while an empty `apex` object passes the gate.
   - Copies top-level saved properties over fresh defaults so lazy fields (`clips`, `countdownMs`, `ml`, and custom properties) survive intact.
   - Merges explicit nested fresh defaults and applies array type guards for list collections (`plays`, `defMoves`, `kickMoves`, `knn`), then runs jump sanitization.
2. **Literal-Target Sub-object Pin:** In baseline `adoptBrain`, `superSide` and `posLearn` merge into **literal** defaults (`v` zero, `n` zero for `superSide`; `d` null, `n` zero for `posLearn`) rather than referencing the fresh brain factory's sub-objects. Adding new defaults for those two sub-objects solely in the fresh brain factory would silently drop during loading. Never add defaults to those two literal merges without a synchronized same-commit update; prefer additive top-level fields elsewhere.
3. **Versioned Forward Evolution:** Any Stage 2+ experiment altering ML observation inputs, action sets, network sizes, or incompatible weight layouts must be gated behind an opt-in `CFG` flag and a versioned brain schema so `v1` saved brains load cleanly forever.
4. **Owner Brain Provenance & Fixtures:**
   - Every file in `brains/` is a real runtime export from the same script version as the baseline (**WDB Bot (practice) v6.7.3**).
   - Export filenames were renamed at export time and carry **no semantics**—never infer training stage or configuration from filenames.
   - Config changes during training happened via DevTools console and are stored separately from the brain object, never touching brain bytes.
   - Duplicates and checkpoints are intentionally retained and documented in the manifest (`sha256`, `duplicate-of`, `source`, `notes`). Real exports are **primary** fixtures; `brains/synthetic/` holds **secondary** negative/edge fixtures (explicitly marked synthetic).
   - **Never retrain owner brains.** Fixtures are owner runtime data (gate-exempt); manifest byte-size, `sha256`, and shape validation serve as a permanent CI tripwire.

---

## 5. Repository Layout & Build Design

### Current Pre-Gate Repository Layout
- `docs/ARCHITECTURE.md` — architecture specification and engineering pins
- `docs/FEATURE-INVENTORY.md` — complete feature contract (`INP`–`SYS`)
- `docs/LICENSING-PLAN.md` — attribution, gate rules, and permission decision matrix
- `brains/` — primary owner v6.7.3 runtime exports + fixture manifest
- `brains/synthetic/` — secondary negative/edge test fixtures (marked synthetic)
- `scripts/build.mjs` — zero-dependency Node.js ordered assembler (built-ins only, no bundler)
- `scripts/test-harness.mjs` — zero-dependency Node.js fixture, purity, and replay test runner
- `.github/workflows/ci.yml` — GitHub Actions CI pipeline
- `.gitignore` — ignores `dist/` (build artifact, not committed pre-gate)

### Post-Gate Layout (Unlocked Only After Written Permission)
- `baseline/WDB Bot (practice).user.js` — frozen read-only reference copy (`5,824` lines / `331,751` bytes)
- `src/` — modular ordered slices assembled inside the single outer IIFE:
  - `00-header.js` (metadata block + IIFE opening)
  - `01-config-binds.js` (`CFG`, `KEYS`, `BOT_KEYS`, binding UI & storage)
  - `02-perception.js` (`PIXI` hook, state reader, ball finder, map extraction)
  - `03-physics-radar.js` (field geometry, flight sim, bounce learning, radar, grapple fuel, `safetyLayer`)
  - `04-ml-lib.js` (pure self-contained `mlLib` for Web Worker serialization)
  - `05-ml-brain.js` (`ML` controller, Worker bootstrap, features, policy, countdown gate, HUD builder)
  - `06-teaching.js` (action tape, clip cutting, context matching, replay)
  - `07-planner-rules.js` (Planner 5.0, MPC 4.0, KNN cloning, stances, legacy tactics)
  - `08-observers.js` (movement calibration, player input inference, watchers, self-review, grab clock)
  - `09-ui-api-loop.js` (HUD panel, buttons, dead `drawOverlay`, export/import, main loop, `window.WDB`, IIFE close)
- `dist/wdb-bot.user.js` — compiled installable userscript delivered via GitHub Actions artifact (gitignored in repo).

### Worker Purity Specification
- **Worker-realm contract:** *"mlLib references no main-script scope; its only global usage is standard intrinsics (currently Math, Float32Array), which any Worker realm provides."*
- Verified in CI by evaluating the serialized source of `mlLib` inside a fresh empty Node `vm` realm (with no advisory intrinsic shadowing).

---

## 6. Six Build Laws & CI Verification Contract

### Six Build Laws (`L-a` through `L-f`)
- **`L-a` Storage Literal Purity:** Exact storage keys (`wdbKeybinds`, `wdbBotKeybinds`, `wdbBotBrain`) must appear literally in `src/`.
- **`L-b` No Wipe Hazard:** `dist/wdb-bot.user.js` must contain zero calls to `localStorage.clear`.
- **`L-c` Zero Sandbox Grants:** `dist/wdb-bot.user.js` must contain zero `GM_` tokens anywhere, including inside comments.
- **`L-d` Exact File-to-Build Bijection:** The build manifest order in `scripts/build.mjs` and the file list under `src/` must match identically in both directions; any orphaned file is a build failure.
- **`L-e` Loud Failure on Missing Patterns:** Test assertions must fail loudly if an expected pattern is absent; silently skipping or passing on missing targets is forbidden.
- **`L-f` Strict Pre-Gate Skip Trigger:** Pre-gate dormancy is keyed **strictly and solely** on the absence of `src/` (emitting a loud `"PRE-GATE: parity dormant"` notice). Once `src/` exists, any skipped check is a hard failure.

### CI Check Matrix
- **Pre-Gate (Active Now):** Fixture-integrity checks across `brains/` and `brains/synthetic/` (exact byte size, `sha256`, schema shape, no retraining) plus original-script self-checks on `scripts/`.
- **Post-Gate (Activates Automatically When `src/` & `baseline/` Enter Repo):**
  1. Header & IIFE purity (`@match`, `@run-at document-start`, `@grant none`, zero `GM_*`, plain non-module IIFE).
  2. Storage identity & `adoptBrain` contract tests (lazy-field and custom-property passthrough survival, `apex` gate including empty-`apex` pass, round-trip deep-contains and jump sanitize invariants, 9 synthetic clones, literal-target restoration check limited strictly to `superSide` and `posLearn`).
  3. Worker-source purity in a fresh empty Node `vm` realm instantiating `mlLib` trainer `(16, 14)` and executing one Q-update and one policy-update step (plus `btoa`/`atob` Buffer stubs for Node harness completeness).
  4. Wire-size sanity check (`32,844` bytes provisional per network; confirmed against baseline—mismatch updates the pin, not code).
  5. Baseline file pin (`5,824` lines / `331,751` bytes) and `WDB.CFG` deep key/value parity comparing compiled output against `baseline/`.

---

## 7. Staged Development Roadmap

One relay round per stage; the bot remains installable and functional after each post-gate stage:

- **Stage 0 — Structure & Parity Build (Permission-Gated):**
  - Commit frozen `baseline/`, split into `src/` slices, assemble `dist/wdb-bot.user.js` via `scripts/build.mjs`, pass all CI parity checks with zero behavior change, and verify live Chrome/Tampermonkey execution in a private room (`WDB.errors.count === 0`).
- **Stage 1 — Decision Log & Seeded Replay Harness:**
  - **Opt-in Seeded Eval Mode:** Add `CFG.evalSeed` (default `null` preserves standard `Math.random()`) routing all stochastic paths (`mlDecide`, clip selection, legacy exploration, aim jitter, fakes, stances/delays, KNN eviction, and `mlLib` init/sampling) through a deterministic PRNG; add opt-in `CFG.evalNoExplore` and deterministic clock injection for offline replay.
  - **Decision Log Ring Buffer & Explicit Export:** Bounded in-memory ring buffer (`CFG.logDecisions = false`, `CFG.logCapacity = 2000`) with **zero silent file writes** and zero `localStorage` expansion, plus an explicit **Export Log** button and `WDB.exportLog()` download helper.
  - **Offline Replay Runner:** Replays state traces via `WDB.setStateProvider` in Node CI and verifies 100% deterministic action and RNG reproducibility.
- **Stage 2+ — Opt-in Measured Experiments (Target: Bonk.io Map `dbid 80622`):**
  - **Stage 2 Calibration Priority:** **1v1 private rooms** on map `dbid 80622`. Gather physics, net opening, bounce/friction, and spawn data via Stage 1 traces; add opt-in visual debug flag (`CFG.mapDebugOverlay`, keeping legacy `drawOverlay` dead by default) and build an offline evaluation suite.
  - **Stage 3+ Brain v2 Experiments:** Develop opt-in versioned `v2` observation/action/reward upgrades measured quantitatively against Stage 1 benchmarks while preserving full `v1` brain compatibility.