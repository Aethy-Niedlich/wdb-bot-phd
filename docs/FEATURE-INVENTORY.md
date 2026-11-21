# WDB Bot v6.7.3 — Complete Feature Inventory

- **Contract Authority:** Where comments and runtime code disagree, **CODE WINS**.
- **Stage 0 Reference Target:** Frozen baseline `baseline/wdb-bot-6.7.3.user.js` (`5,824` lines / `331,751` bytes, pure ASCII).
- **Default Authority Note:** Documented config defaults (such as `setupPlay: false`) are descriptive records; **CI dual-realm parity against `baseline/wdb-bot-6.7.3.user.js` is the sole authority** (if baseline differs, update documentation rather than code).

---

## 1. Input & Keybinds (`INP`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `INP-01` | `F6` (`CFG.bindKey`) runs a 9-step interactive walk-through binding user controls (`left`, `right`, `up`, `down`, `heavy`, `grapple`) and hotkeys (`toggleKey`, `teachKey`, `panelKey`), `Esc` keeps current values, saved in `localStorage['wdbKeybinds']`. |
| `INP-02` | `F5` (`CFG.botBindKey`) runs a 6-step prompt for separate bot output keys (`BOT_KEYS`) saved **diff-only** (only keys differing from user `KEYS`) in `localStorage['wdbBotKeybinds']`, preventing default browser `F5` reload. |
| `INP-03` | Startup starts with all six `KEYS` controls unset (`null`); `findBonkBinds` is **dead code** (defined in baseline with zero call sites or references anywhere; inline comments mentioning fallback arrow/X/Z defaults are stale; keep `findBonkBinds` dead). |
| `INP-04` | Synthetic key dispatcher (`sendKey`, `setKeys`, `releaseAll`) dispatches `keydown`/`keyup` UI events on `#gamerenderer` (or `document`) using `botKey`. |
| `INP-05` | Key auto-refresh (`refreshKeys`) re-sends `keydown` for held keys every `300 ms` (`CFG.keyRefreshMs`), or every `50 ms` while waiting for round start or within `600 ms` post-live in ML mode. |
| `INP-06` | Trusted keyboard tracker (`userHeld`, `keyNameOf`) records trusted `keydown`/`keyup` events matching `KEYS` and clears on `window.blur`. |
| `INP-07` | `F2` (`CFG.toggleKey`) toggles bot `enabled` state ON/OFF, releasing synthetic keys and exiting Teaching mode when turned OFF. No `F7` hotkey exists. |

---

## 2. Perception & Scene Extraction (`PER`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `PER-01` | PIXI Graphics hook (`hookPixi`) wraps `drawCircle`, `drawRect`, `drawRoundedRect`, `drawEllipse`, `drawPolygon`, and `clear`, polling every `100 ms` to survive PIXI swaps while counting rehooks and swaps. |
| `PER-02` | Player identification (`myName`, `nameOf`, `currentRoot`) matches `CFG.myName` or `#pretty_top_name` against container text labels and scopes tracking to the active game root, keeping `lastRoot` while dead/spectating. |
| `PER-03` | Canvas normalization (`canvasScale`) converts pixel coordinates to Bonk's `730 x 500` map units (`BONK_W = 730`), cached for `1 s`. |
| `PER-04` | Motion sampler (`sample`) computes EMA-smoothed `(vx, vy)` (`alpha = 0.5`) and cumulative displacement, skipping identical coordinates under `50 ms` so velocity tracks actual render updates. |
| `PER-05` | Ball finder (`findBall`, `findBallFull`) runs full scene scan every `250 ms` (`CFG.ballRescanMs`) picking the most-moved ball-sized (`6..70`) roughly round object (or resting kickoff candidate within `60` units of `midX`), reading the tracked ball directly between rescans and flagging `kickoff` when resting. |
| `PER-06` | Exact geometry extractor (`buildMap`) builds world-space circles, polygons, and ellipses (`solidShapes`) at `1 Hz`, excluding background rectangles, moving objects, and shapes enclosing players. |
| `PER-07` | Fallback bounding-box scanner (`scanMap`) collects static non-player bounding boxes (`shapes`) at `1 Hz` when exact geometry is unavailable. |
| `PER-08` | Auto physics calibration learns `learnedFloorY` (lowest low-velocity player `y`) and `gravityEst` (ball vertical acceleration), overridable via `CFG.floorY` and `CFG.gravity`. |
| `PER-09` | Ball telemetry (`ballInfo`) derives `height`, `speed`, `angle` (degrees), `towardOurNet`, and `rising`. |
| `PER-10` | Test injection hook (`WDB.setStateProvider(fn)`) replaces scene reading with an external state provider. |

---

## 3. Field Geometry, Flight, Safety & Grapple Radar (`PHY`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `PHY-01` | Auto field geometry detector (`field`) locates the open side-wall net gap, ceiling, back ramp, and center ramp, falling back to standard WDB dimensions, with net checks and centers mirrored by side. |
| `PHY-02` | Manual landmarks (`CFG.goal`, `CFG.ramp`, `CFG.waitFromBarrier`) store origin side and automatically mirror across red/blue. |
| `PHY-03` | Shared ball flight simulator (`simFlight`, `ballFlight`, `ballPos`) projects `2.0 s` at `60 Hz` with surface bounces using learned `bounce` and `slide` friction. |
| `PHY-04` | Bounce & floor-friction learner (`learnBounces`) adapts `bounce` and `slide` on sudden velocity reversals or floor rolls (active in legacy/planner live ticks and dead non-ML ticks; skipped during live ML ticks). |
| `PHY-05` | Map-aware player clamps (`halfClamp`, `blockedX`, `groundAt`) confine predictions to own half, wall surfaces, and underlying slopes/ramps. |
| `PHY-06` | Grapple meter tracker (`updateFuel`, `hasFuel`) simulates `5000 ms` capacity, `5000 ms` full recharge, and `fuelLocked` depletion lockout until full (reading user keys in Teach mode, synthetic keys otherwise). |
| `PHY-07` | Grapple radar (`radar`) sorts all objects inside `grappleRange` (`110`) by surface distance (`ball`, `player`, `ground`, `map`, `wall`) to identify `ballNearest` (margin `6`) and `groundNearest`. |
| `PHY-08` | Safety override (`safetyLayer`): runs only on the planner/legacy brain's keys; its single call site sits after the ML/teach early-return in the main tick; ML and teaching bypass it. Checks decisions over `0.9 s` against `killMargin` (`10`, or `3` for still kickoff ball), skipping `THROW` mode, distant opponent ropes, and trusted `WAIT_JUMP` holds. |

---

## 4. Machine Learning Brain (`ML`) — Default (`CFG.ml = true`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `ML-01` | Feature encoder (`mlFeatures`) outputs `16` left-mirrored normalized inputs (`ML_IN = 16`): ball relative position/velocity, self velocity, grounded flag, holding flag, fuel ratio, barrier distance, ball side, kickoff/contest flag, self/ball heights, ball-nearest-vs-floor flag, and ball distance. |
| `ML-02` | Discrete action space (`ML_ACTIONS`) defines `14` key combinations (`ML_NA = 14`), automatically mirrored left/right for the right side. |
| `ML-03` | Pure self-contained neural library (`mlLib`) builds two 3-layer MLPs (`16 -> 64 -> 64 -> 14`, LeakyReLU `0.01`) trained with Adam: Double DQN (`Q` + target `T` synced every `500` updates) and Imitation policy (`P`, weighted cross-entropy). |
| `ML-04` | Background Web Worker trainer (`mlInit`, `CFG.mlWorker = true`) serializes `mlLib` into a Blob Worker (referencing no main-script scope, using standard intrinsics `Math` and `Float32Array` only), sleeps when idle `> 5 s`, and falls back to main-thread `mlLocal` on failure. |
| `ML-05` | Replay & demo circular buffers store `40,000` n-step transitions (`mlNStep = 8`, `mlGamma = 0.99`, TD target clipped `[-3, 3]`) and `30,000` imitation demos. |
| `ML-06` | Policy & exploration (`mlDecide`) combines Q-values with `mlImitate * log(pi)` once demos exceed `200`, mixing multi-step exploration at rate `mlEps` (`0.3` decaying toward `0.04` with half-life **60,000 decisions**). |
| `ML-07` | ML reward shaping grants territory trickle (`+/- 0.002`/step), catch bonuses (`+0.2` / `+0.3` save), death penalty (`-1` when ball distance `< 70`, `0` on round end), and shared watcher verdicts. |
| `ML-08` | Rope-hold detector tracks catches and releases to toggle `THROW` mode, award catch rewards, and feed throw observation. |
| `ML-09` | Countdown start detector (`mlRoundLive`, shared by ML and non-ML modes) holds idle until any player/ball moves `> 3` units or learned `countdownMs` elapses. |

---

## 5. Teaching Mode & Memorized Moves (`TCH`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `TCH-01` | `F3` (`CFG.teachKey`) toggles Teaching mode (enables bot, releases synthetic keys, and forces `mlTick` even when `CFG.ml === false`). |
| `TCH-02` | User actions during Teaching populate imitation demos weighted `CFG.teachWeight` (`3x`) and inject user-earned rewards into RL replay. |
| `TCH-03` | Rolling action tape (`mlTape`) records user key bitmasks and relative ball paths for `clipMaxMs` (`6000 ms` + buffer). |
| `TCH-04` | Automatic clip extractor (`mlSaveClip`) segments `play` or `kick` moves upon Saves, Shots, Kickoffs, or Passes verdicts, storing up to `200` clips (evicting lowest score/oldest). |
| `TCH-05` | Context-matched clip replay (`mlPickKickoff`, `mlPickPlay`, `mlReplayStep`) holds taught kickoff opening keys through countdown, replays matching mid-round moves (mirrored), aborts on `clipDiverge` (`100`), and updates clip scores from verdicts. |

---

## 6. Planner 5.0 & MPC 4.0 Brains (`PLN`) — Fallback (`CFG.ml = false`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `PLN-01` | Planner release scorer (`CFG.planner = true`, `planRelease`, `releaseValue`) evaluates `1.6 s` flights over `0..0.6 s` swing angles (`+1000`/`-1000` goals, `-1000` self-hits, `+300` solid cross + enemy proximity, `+350` passes), balancing wait decay vs remaining grapple fuel. |
| `PLN-02` | Planner ground controller evaluates `planSave` for catches (`+500`) across jump types, pre-waits (`0..0.6 s`), pre-runs, and air moves (`boost`, `balloon`, `bsuper`), falling back to `mpcMove`. |
| `PLN-03` | MPC future scorer (`CFG.mpc = true`, `mpcMove`) evaluates `0.25 s` left/right/still horizons via lightweight `planSave`, clearance, target spot cost, and KNN cloning bonuses. |
| `PLN-04` | Planner air steering (`airSteer`) simulates `0.5 s` left/right/still air trajectories to catch on nearest ball or track ball flight. |
| `PLN-05` | State-matched KNN copier (`cloneSuggest`, `learnClone`) stores up to `4,000` frames of rated players' saves and votes on `mpcMove` ground direction (`cloneBonus = 60`). |
| `PLN-06` | Shot memory (`shotKey`, `planSig`, `rememberShot`) indexes incoming shots by kind/angle/speed, boosting winning plans and filtering responses scoring `< -0.4`. |

---

## 7. Rule-Based Tactics & Fallback (`RUL`) — (`CFG.ml = false`, plus shared `JUMP`/`THROW`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `RUL-01` | Jump controller (`JUMP` mode) executes `low`, `regular`, `high`, `super` boosts, optional air moves (`boost`, `balloon`, `bsuper`), directional drift/angled super, and mid-air grabs (including emergency grabs when doomed or tightly avoiding). |
| `RUL-02` | Stance selector (`chooseStance`, `waitSpot`) chooses `middle`, `forward`, `deep`, `shadow`, `copied`, or unlocked `meet` counter (`15` good saves at `>= 60%`), with variable read delay and deadzone balance tapping. |
| `RUL-03` | Swing anticipation (`readSwing`) projects opponent rope arcs over `0.6 s` to lean toward predicted landing zones (`CFG.anticipate`). |
| `RUL-04` | Copy-first macro replay (`tryCopy`, `findCopy`, `COPY` mode) replays watched `defMoves`, `kickMoves`, and `moves` with frame resync and drift steering (`copyNudge`), scaled by `copyStats` grab rate. |
| `RUL-05` | Rule-based kickoff & loose-ball pickups drag kickoff grabs onto our side (`kickoffDragDepth = 90`), steer pickup jumps, or enter `SETUP` backwall-to-ramp plays when `CFG.setupPlay` and `CFG.offense` are enabled. |
| `RUL-06` | Rule-based defense handles `planSave`, just-over-head grabs, dropping dodges, low jump-overs, `readSpot`/`meetSpot` tracking, and `CFG.offense = false` backwall clears. |
| `RUL-07` | Rule-based throw controller runs recorded shot replay, save-momentum quick clears, stall regrabs (`stallMs`), target choice (net vs leading moving enemy with jitter & fakes), learned `throwPower`, and teammate passing (`front`/`behind`/`above`/`below`). |
| `RUL-08` | Teammate coordination (`teamInfo`) yields kickoffs/loose balls when a teammate holds the ball or is `> 40` units closer (`teamGap`). |
| `RUL-09` | Unused `CFG` keys (`aimY`, `grabIdeal`, `maxCarryMs`) retained verbatim with zero runtime consumers; `setupPlay: false` parity is governed by CI dual-realm comparison against `baseline/wdb-bot-6.7.3.user.js`. |

---

## 8. Observation, Learning & Self-Review (`OBS`) — Active While Alive or Dead

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `OBS-01` | Self-physics calibration (`learnMyMovement`, `learnTick`, `airLearnTick`) updates directional accelerations, gravity, jump heights/timings, angled super kick, and air-move effects (`sanitizeJumps`). |
| `OBS-02` | Player input reader (`readOpponentInputs`) infers directional/action key bitmasks and estimates remaining grapple fuel for every other visible player. |
| `OBS-03` | Continuous match watchers record throws, saves, kickoffs, wait positions, passes, opponent jump heights, and player deaths. |
| `OBS-04` | Player skill scorer (`credit`, `skillOf`, `dudPlayer`) tracks win/fail ratios per player name to weight imitation/copying and suppress low-performing players (`< 25%` after `>= 6` events). |
| `OBS-05` | Self-review engine (`reviewTick`, `reviewDeath`, `passTick`, `kickoffTick`) verdicts Saves (`good`/`bad`/`wall`), Shots, Kickoffs, and Passes, updating review tallies, hold buckets, target stats, `tabu` cooldowns (`30 s`), and ML rewards. |
| `OBS-06` | Grab clock (`grabClockTick`) penalizes stalled loose balls (`3.0 s`) or kickoffs (`2.5 s`) by docking active approaches, setting `tabu`, incrementing `tooSlow`, and issuing `mlRewardSlow`. |

---

## 9. UI, Diagnostics & Console API (`UI`, `API`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `UI-01` | Top-left HUD overlay (`render`) shows binding prompts, missing-keys alert, compact single-line status + ball clock, dead/watching summary, or full multi-line telemetry (`F4` / `CFG.panelKey`). |
| `UI-02` | Top-right button bar (`makeButtons`, visible only when `CFG.panelFull === true`) provides `Set my keys`, `Set bot's keys`, `Export brain`, and `Import brain`. |
| `UI-03` | `drawOverlay` is dead rendering code (never invoked anywhere and not exposed on `window.WDB`; keep dead in Stage 0). `showMap`: live setter, dead read path — command exists, effect does not. |
| `API-01` | `window.WDB` state properties/setters: `CFG`, `setStateProvider`, `mode`, `errors`, `ml`, `teaching`. |
| `API-02` | `window.WDB` keybind API: `setKeys`, `setBotKeys`, `resetBotKeys`, `keys`, `resetKeys`. |
| `API-03` | `window.WDB` teaching API: `teach`, `pressKey`, `moves`, `forgetMoves`. |
| `API-04` | `window.WDB` brain/map/player API: `map`, `showMap` (live setter, dead read path — command exists, effect does not), `brain`, `exportBrain` (wrapper ignores argument and forces download true; relies on `document.body` existence guard for non-DOM JSON string return), `importBrain`, `forget`, `players`, `meter`. |
| `API-05` | `window.WDB` calibration/diagnostic API: `markGoal`, `markRamp`, `markWait`, `debug`, `scan` / `Scan` (async `0.5 s` motion table). |

---

## 10. Persistence & Loop Scheduling (`SYS`)

| ID | Feature / Behavior (Code-Verified) |
|---|---|
| `SYS-01` | Brain persistence (`saveBrain`, `saveNow`, `adoptBrain`) writes `brain` JSON to `localStorage['wdbBotBrain']` throttled to `20 s` via `requestIdleCallback` plus `pagehide`/`visibilitychange`, preserving lazy fields verbatim and using literal merge targets for `superSide` (`v` zero, `n` zero) and `posLearn` (`d` null, `n` zero). |
| `SYS-02` | Scheduler loop (`loop`, `botTick`) polls at `100 ms` (OFF), `1000/mlHz` (`25 ms` in ML), or `pollMs` (`~4.17 ms` in legacy), gated by scene coordinate signature changes (`50 ms` max skip) and `tickMs` (`~5.56 ms` non-ML), tracking bot TPS and `requestAnimationFrame` game FPS. |