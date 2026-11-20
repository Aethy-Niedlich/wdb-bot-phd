# Aethy Notes - Aethy Niedlich
I had like MiniMax M3.1 Flash like write this because I didn't understand anything lol -Aethy 20/11/26 D/M/Y
It's basically just Game Bot Terms for dummies... -Aethy 20/11/26
BTW this also mentions my other project which is frozen as of November 20, 2026 7:06 PM -Aethy 20/11/26
BTW I pasted this here because I didn't feel like adding it to the main project lol - Aethy 20/11/26
Still haven't fully even read this, really long, woah! -Aethy 20/11/26

# WDB-BOT GLOSSARY — RL / IL / game-bot vocabulary

Working vocabulary for the WDB-BOT project: the terms that appear in DECISIONS.md, in the
practice userscript, and in the public bonk.io RL work. Every entry says what it means AND
where you will meet it in this project, because a term you don't recognise is usually a term
you haven't connected to a decision yet.

You already know: **IL** (imitation learning), **BC** (behavioral cloning), **RL**
(reinforcement learning). Those are the trunk of the tree below.

---

## 1. The imitation-learning family

| Term | Meaning | Where you meet it |
|---|---|---|
| **BC** | Behavioral cloning. Train a policy to predict the expert's action at each state. A supervised regression problem. | §2: "plain BC on all labelled frames". The first thing the project does. |
| **Expert / demonstrator** | Whoever supplies the labels. Usually a strong human, sometimes a bot. | Your 8 official clips; the practice script's "watching" mode. |
| **Covariate shift** | BC trains on states the *expert* visited, but at test time the policy visits states the *expert never reached*. The classic reason BC fails. | The single biggest reason your BC bot will plateau. |
| **DAgger** | Dataset Aggregation. Keep the expert in the loop: every state the *learner* visits gets an expert label; retrain on the union. Fixes covariate shift. | §2 says "DAgger impossible" — because you can't ask a human to label arbitrary states. Qwen scoped this on 11-18: impossible *with replay-only labels*. |
| **Label oracle** | Anything that can produce a correct action for an arbitrary state. | The in-tab `readOpponentInputs()` in the practice script IS an oracle (for l/r/u/g). |
| **Filtered BC** | Keep only expert data that a learned value function considers good. | Qwen's "offline critic EV≥0.5" gate is this shape: use a critic to filter labels. |
| **GAIL / AIRL** | Imitation via a discriminator; AIRL is the max-entropy version that also recovers a reward. | Not in your plan. Relevant if you ever want a reward from *watching* instead of hand-specifying it. |
| **SFT / "teaching"** | Supervised fine-tuning. What the practice script calls "learning by watching" (`mlWatch` → `ML.demoBox`). | `mlImitate: 0.6` = how much the imitation signal counts next to the learned signal. |
| **Policy** | The thing that maps a state to an action. | Your ActorCritic's actor half. |
| **Policy distillation** | Train a small/fast policy to imitate a big/slow one. | The practice script's MPC planner could be a *teacher* for the NN. |

## 2. The RL family

| Term | Meaning | Where you meet it |
|---|---|---|
| **MDP / POMDP** | Markov Decision Process: (S, A, P, R, γ). A **POMDP** adds partial observability — you see an observation, not the state. | bonk.io is a POMDP: you can't see the opponent's exact position/inputs. |
| **State vs observation** | State = the full truth. Observation = what the agent can see. | Your obs.v1 (122 dims) is an *observation* built from a state. obs.r1 (renderer-derived) is an observation from pixels. |
| **Return / G** | Sum of discounted rewards: G = Σ γᵗ rₜ. | γ = 0.4^(1/Δk) in §2 means **the discount half-life equals the stage length**: after Δk ticks the weight is 0.4. Elegant — worth understanding why they wrote it that way. |
| **Value function V(s)** | Expected return from state s. | The "critic" in ActorCritic. |
| **Q(s,a)** | Expected return from taking action a in state s. | The Q net in the practice script. |
| **Advantage A(s,a)** | Q(s,a) − V(s): how much better this action is than the state's average. The thing you actually maximize. | GAE estimates it; that's what PPO updates on. |
| **Baseline** | A value estimate subtracted from returns to cut gradient variance. | `V(s)` is the baseline in ActorCritic. |
| **On-policy vs off-policy** | On-policy learns only from its own recent data (PPO, A2C). Off-policy can reuse old data (DQN, SAC). | Their whole "self-play league + replay mix" is off-policy reuse. |
| **n-step returns** | Bootstrap from the n-th step instead of the end. | `mlNStep: 8` in the script; §5's kill credit over "tau 45-90 ticks" is a similar idea. |
| **Entropy bonus** | Add exploration pressure to the reward. | Counterpart of ε-greedy in continuous/large action spaces. |
| **PPO** | Proximal Policy Optimization. Clips the policy update so a step can't move the policy far. Simple, stable, the default for game agents. | §2: "anchored PPO + backplay → self-play league". |
| **Anchored PPO** | PPO with a KL penalty pulling toward a reference policy, so the policy doesn't drift off-contract. | §2. Keeps a fine-tune from destroying a BC-pretrained policy. |
| **GAE (λ)** | Generalized Advantage Estimation: a bias/variance knob for estimating advantages. λ≈0.97 in §2. | The `lambda~0.97` in §2. |
| **Bootstrapping** | Using V(s′) to estimate future value instead of waiting for the episode to end. | §5: bootstrap ONLY on truncation, never on a goal. Off-policy correctness. |
| **Truncation vs termination** | Truncated = cut off (time limit, still running → bootstrap). Terminated = episode really ended (goal/death → no bootstrap). | §4's "fte −1 → ≥0 flip (goal tick KEPT)" and "fte===0 safety net" are termination codes. |
| **Reward shaping** | Adding intermediate rewards to make sparse goals learnable. | §5's reward design (win +100, death −10, kill credit). Shaping can change the optimal policy — a classic failure mode. |
| **Potential-based shaping** | Shaping of the form γΦ(s′) − Φ(s), which provably doesn't change the optimal policy. | §5 mentions potentials Φ(terminal)=0. |
| **Credit assignment** | Which past action deserves the reward. | §5's kill credit K_k via `swing.b===ballIdx`. |
| **Exploration** | ε-greedy, ε decay schedules, entropy bonus, count-based, intrinsic reward (RND), UCB. | `mlEps: 0.3 → 0.04`, halving every 60s, in the script. |
| **Sparse vs dense reward** | Sparse = only win/lose. Dense = lots of intermediate signals. | Dense (shaped) learns faster but risks a different optimum than you intended. |
| **Discount / effective horizon** | 1/(1−γ) in steps. Your γ=0.9989 → horizon ≈ 873 ticks ≈ 29 s at 30 Hz. | §2's "stage-level constant". |
| **Off-policy evaluation (OPE)** | Evaluating a policy without running it (FQE, DMF, DICE). | Relevant to the eval-lab work (D-DEP2). |
| **Explained variance (EV)** | How much of the value function's variance the critic explains. EV<0 = worse than predicting the mean. | §6's "offline critic EV≥0.5" gate. |
| **Model-free vs model-based** | Model-free learns the policy directly; model-based learns a simulator/world model first. | Your D1: headless **real** engine = model-based-ish (exact), vs PixelMelt's learned Box2D port. |
| **World model** | A learned or reconstructed simulator. | bonk-core.mjs is a *real* engine, not a learned model — that's your edge. |
| **Curriculum** | Ordering/scheduling of training scenarios. | §4's mixed resets (round-start ≥50%, replay-state 25-40%). |

## 3. Offline RL

| Term | Meaning | Where you meet it |
|---|---|---|
| **Offline RL** | Learning from a fixed dataset, no new environment interaction. | §2: "plain BC ... then critic warm-up". |
| **Distribution shift** | Acting on states unlike the dataset's. Offline RL methods (CQL, IQL) exist to control it. | Why BC on 5,786 frames is risky. |
| **Conservative methods (CQL/IQL)** | Penalize acting on OOD states so the learned policy stays near the data. | Not in your plan. Possibly a stage-2 alternative to PPO. |
| **Dataset as the bottleneck** | In offline RL, the dataset is usually the limit, not the algorithm. | Your D-GAP and the 5,786-frame ceiling. |

## 4. Networks and optimization

| Term | Meaning | Where you meet it |
|---|---|---|
| **Head** | The output layer(s) of a network. | "Action head: SINGLE Categorical" — one head, 32→64 slots, over a shared trunk. |
| **Trunk / body** | Shared hidden layers feeding one or more heads. | §2's single trunk + actor/critic heads. Two heads, one trunk. |
| **Categorical vs MultiDiscrete** | Categorical = one softmax over N discrete actions. MultiDiscrete = independent choices per dimension (e.g. 4 dims of 3/3/2/2). | §5 R1: MultiDiscrete(3,3,2,2)/N_ACTIONS=36 is **SUPERSEDED** → Categorical(32). |
| **Action mask** | Logit mask that disables unused action slots at runtime. | `policy.py`'s `action_mask` arg already supports it — that's why D-ACT1's 64-capacity head needs no other change. |
| **Logits vs probs** | Categorical samples from softmax(logits); masking sets unused logits to −inf. | `masked_fill(~action_mask, -inf)`. |
| **Activation** | ReLU, leaky ReLU (0.01 slope), tanh, SiLU/GELU. | Script: leaky 0.01. Yours: SiLU + LayerNorm. |
| **LayerNorm** | Normalizes each sample's features; stabilizes deep nets. | §2's trunk: Linear → LayerNorm → SiLU ×3. |
| **He init** | Weights ~ N(0, 2/n_in); standard for ReLU-family nets. | Script uses `sqrt(2/nIn)`. |
| **Adam** | Adaptive optimizer with momentum + per-parameter second moment. | Script: b1 0.9, b2 0.999. |
| **Gradient clipping** | Clamp gradients to a norm/range to stop explosions. | Script: ±1. |
| **Backprop** | Reverse-mode automatic differentiation by hand. | Script does it manually in Float32Array. |
| **Loss / surrogate objective** | What the optimizer minimizes. | PPO's clipped surrogate; BC's cross-entropy. |
| **Epoch / minibatch / batch size** | Full passes over data; how many samples per update. | Off-policy training mixes. |
| **LR schedule / warmup** | Learning rate over time. | Not exposed in your plan. |

## 5. The training loop

| Term | Meaning | Where you meet it |
|---|---|---|
| **Env / environment** | Anything the agent acts in and gets rewards from. | Your `node_env.py` wraps the real engine. |
| **Step / tick / frame** | One agent decision + environment update. bonk.io: 30 ticks/s. | Tick = one physics update; a frame = one render. |
| **Episode / round** | From reset to termination. | A WDB round, ~800 ticks, 1v1. |
| **Rollout** | A batch of trajectories collected by the current policy. | §4's rollouts on Kaggle. |
| **Iteration / update** | One round of collect → learn. | Your §6's 10-15 min checkpointing cadence. |
| **VecEnv** | N environments stepped in parallel for throughput. | `vec_env.py` exists; §6 wants K≥32 envs/worker. |
| **IPC / subprocess workers** | Parallelism via separate processes (Node engine per worker). | §6: "single Python driver serializes" is the known bottleneck. |
| **Replay buffer** | Stored transitions, sampled for training. | `ML.demoBox` / `ML.win` in the script; your §7 data loader. |
| **Demo buffer** | Stored *expert* transitions. | `ML.demoBox` gets both own and watched samples, with different weights. |
| **On-policy staleness** | How old the data you're learning from is. | League/replay mixture design. |
| **Self-play** | The agent plays itself. | §2's self-play league. |
| **Seed / RNG state** | Deterministic randomness; part of a checkpoint. | §6: "Checkpoint every 10-15 min FULL state (model, optimizer, PopArt, normalizer, RNG, ...)". |
| **Checkpoint** | Full resumable training state. | Must include RNG to be reproducible. |

## 6. Self-play, leagues, evaluation

| Term | Meaning | Where you meet it |
|---|---|---|
| **League** | A population of agents (main + past selves + specialists) trained against each other. | §2's self-play league. |
| **Exploiter** | An agent trained specifically to beat the main policy — finds weaknesses. | PixelMelt/AlphaStar style; Qwen's D-DEP2 material. |
| **Backplay** | Train on *past* states of past episodes, not just fresh self-play. | §2: "anchored PPO + backplay". |
| **PFSP** | Prioritised Fictitious Self-Play: sample opponents in proportion to how close they are to beating you. | Reduces forgetting. |
| **Elo** | Rating system for head-to-head strength. | Qwen's caution: rolling-self-play Elo can plateau while you're still improving. |
| **Exploitability** | Worst-case win rate of a policy against the whole pool. The rigorous version of "is this bot actually strong". | Better than average win rate. |
| **Cross-play / policy pool** | Evaluate against a *distribution* of past selves, not one opponent. | §4's "held-out replays" + league. |
| **Held-out evaluation** | Data never trained on. | §2's "round-start + held-out replays". |
| **In-sample vs out-of-sample** | A match against someone whose data you trained on is in-sample. | D-DEP4b: volunteer matches where the volunteer's frames were used for training are IN-SAMPLE. |
| **Null agent / random policy** | The floor. Zero-action and random must not win. | §4's gate, before PPO. |
| **Leakage (label leakage)** | The dataset lets you cheat: some feature alone predicts the answer. | §4: "max single-feature input-bit accuracy < ~0.98". |
| **Coverage / zero-coverage** | Did the test suite actually exercise every case? | §4: "zero-coverage = FAIL". |
| **Statistical power / SE** | Can your experiment even detect the effect? | n=100 → SE=5pp; paired n = 7.84·φ/d². D-DEP2. |

## 7. Engineering, determinism, evidence

| Term | Meaning | Where you meet it |
|---|---|---|
| **Determinism** | Same inputs → same outputs, exactly. | §4's Node-internal determinism gate (200 ticks). |
| **FP drift** | Floating-point differences accumulate; two sims diverge chaotically. | §0: "cross-engine tick-exact" killed; browser vs Node differ by ~1e-1 by tick 300. |
| **Bit-exactness** | Byte-identical results. | PixelMelt claims 1961/1961 maps bit-identical; you deliberately don't need that. |
| **Parity** | Two implementations agree on the same inputs. | L2: obs.py vs obs.mjs ≤1e-6. |
| **Round-trip** | Serialize → deserialize → identical. | §4's snapshot round-trip gate (100 frames). |
| **Snapshot** | A frozen copy of world state. | §1: "the world is DESTROYED at end of step" → snapshot must be pre-step. |
| **Purity** | No hidden state leaking between calls. | §4's purity gate. |
| **Gate** | A pass/fail condition that blocks the next stage. | §4's C2/L1/L2/L3, the null-agent gate, the leakage gate. |
| **Budgeted experiment** | A hypothesis + the compute you're willing to spend + a stop rule. | §0's change rule: "entry + gate + budgeted experiment". |
| **Hypothesis budget** | How many experiments you may run per week. | §6: "6-10 hypothesis-budgeted runs/week with stop rules". |
| **Holdout / held-out map** | A map or clip never trained on, used to detect memorization. | §2: "Variant map = EVAL-ONLY OOD". |
| **Version pinning / hash** | Freeze a file by its content hash. | §3: manifest is hash-pinned, version-bumped. |
| **Infra vs algorithm** | Often the bottleneck is engineering, not modeling. | Your project: 2 CPU cores, "CPU is the scarce resource, not GPU". |

## 8. Game-bot vocabulary

| Term | Meaning | Where you meet it |
|---|---|---|
| **Tick / substep** | One physics update. bonk.io: fps 30, substeps 1. | §1. |
| **Fixed timestep** | Simulation advances in constant steps regardless of render rate. | Why decisions should sync to ticks, not frames. |
| **Action repeat** | Hold the same action for N ticks. | Cuts decision cost; changes effective control rate. |
| **Input lag / latency** | Delay between your decision and the engine applying it. | §2: RL-only 0-8 ticks; obs.v2's last-8-sent-actions. |
| **Jitter** | Variance in that delay. | Volatile-session data. |
| **Frame stacking** | Feeding several past frames as one observation. | PixelMelt's 0/1/3/7/15/30/60; the practice script has **none**. |
| **Recurrent policy / LSTM** | A policy that remembers via hidden state (proper POMDP solution). | Not in your plan; frame stacking is the cheap approximation. |
| **Open vs closed loop** | Open loop = pre-planned actions. Closed loop = react to what you observe. | The practice script has both (planner = open-ish, ML = closed). |
| **Human-like / playability** | Whether a bot is fun and believable, not just strong. | The north-star: voluntary rematch rate (D-DEP4e). |
| **Anti-bot detection** | The game noticing you aren't human. | DevTools detection; DOM key injection vs websocket client. |
| **ToS / private rooms / consent** | Rules and ethics of automated play and recording people. | D-DEP4's preconditions. |
| **Map / mode / dbid** | Map id 80622 = WDB; 955838 = variant (EVAL-ONLY). | §7. |
| **Cap zone / goal / deathball** | The scoring zones and the lethal ball. | §1. |
| **Grapple / swing / rope** | Attach to a surface/ball; swing mechanics. | §1: omnidirectional nearest valid surface, stamina gate a1a>500. |
| **Heavy / density** | Density multiplier (1+3.7·stamina) → up to 4.7×. | The ×4.7 mechanic in §1. |

## 9. Commonly confused pairs (the ones that actually cause bugs here)

| Pair | Difference |
|---|---|
| **State vs observation** | State is truth; observation is what you see. Your 122 dims are an observation, not a state. |
| **Termination vs truncation** | Terminated → no bootstrap. Truncated → bootstrap. §5 is explicit about this. |
| **Model (RL) vs model (engine)** | In RL, "model" = simulator/world model. In your repo, `wdb_engine.so`/`bonk-core.mjs` = the real engine. Same word, opposite directions. |
| **Vocabulary id vs raw mask** | id is a table index; mask is the engine's 6-bit flags byte. `obs` stores the MASK; the policy emits the ID. |
| **Action vs control vs key** | Key = physical key. Control = the 6-bit intent (l/r/u/d/heavy/grapple). Mask = controls packed into a byte. The practice script gets this exactly right: it stores controls, not keys. |
| **Exploration vs exploitation** | ε-greedy's two halves; `mlEps` is the first, the Q net's argmax is the second. |
| **Reward vs return vs advantage** | reward = one step; return = discounted sum; advantage = action minus baseline. |
| **Imitation vs demonstration** | A demonstration is data. Imitation is the learning procedure. |
| **Train vs inference vs deployment** | Three different environments: your env, your eval env, and a live bonk.io tab. All three need the same obs + action contract. |

## 10. Acronyms

BC behavioral cloning · IL imitation learning · RL reinforcement learning · DQN deep Q-network ·
PPO proximal policy optimization · GAE generalized advantage estimation · GAIL generative
adversarial imitation learning · AIRL adversarial inverse reinforcement learning ·
DAgger dataset aggregation · OPE off-policy evaluation · EV explained variance ·
MPC model predictive control · LLM large language model · MLP multilayer perceptron ·
fps frames per second · IPC inter-process communication · TF tensor/transformer framework ·
JS JavaScript · JSONL newline-delimited JSON · SHA-256 hashing algorithm ·
ToS terms of service · ELO rating · PFSP prioritised fictitious self-play ·
RLHF/RLVR not used here yet · KM Kalman filter (used for the delayed-entry left-truncation note).
