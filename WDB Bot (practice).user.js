// ==UserScript==
// @name         WDB Bot (practice)
// @namespace    wdb-bot
// @version      6.7.3
// @description  Machine-learning bot for WeiRd DeAth BalL on bonk.io (learns by watching and by trying). For private rooms / practice only.
// @match        https://bonk.io/gameframe-release.html*
// @run-at       document-start
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/598200/WDB%20Bot%20%28practice%29.user.js
// @updateURL https://update.greasyfork.org/scripts/598200/WDB%20Bot%20%28practice%29.meta.js
// ==/UserScript==

/*
 * VERSION 6: THE LEARNING BRAIN (default, CFG.ml = true)
 *  - No plans, no jump knowledge, no dodging rule. A small neural network sees the game
 *    (where the ball is and how it's moving relative to the bot, the bot's own speed and
 *    height, grapple left, whether it's holding the ball, whose side the ball is on, kickoff
 *    or not) and picks which keys to hold, ~40 times a second.
 *  - It learns by WATCHING: every moment of the players it rates as good becomes "in this
 *    situation they pressed this", and a second network learns to imitate that.
 *  - It learns by DOING (deep Q-learning): its self-review hands out rewards - died -1, bad
 *    save / let one in -, good save +, shot over +, kickoff won + / lost -, too slow to get
 *    the ball -, catching the ball +, good / bad passes - and it learns which keys lead to
 *    good outcomes from each situation. It's mirrored, so red and blue learn as one.
 *  - Training runs in a background thread (a Web Worker), so the game doesn't lag. Saving is
 *    rare and done when the browser is idle. The ball is found with a full scene search only
 *    4 times a second (in between, only the ball is read).
 *  - It starts out bad (it doesn't know anything, not even that the ball kills) and gets
 *    better with play and with watching good players. Export/Import carries the networks.
 *  - WDB.CFG.ml = false switches back to the old planner brain described below.
 *
 * YOUR KEYBINDS (F6) AND THE BOT'S (F5)
 *  - It starts with NO keys: until you set them it presses nothing and teaching reads nothing.
 *  - The bot presses the keys YOU play with, and teaching reads them. Press F6 (or "Set my
 *    keys") and press each control when asked, then the keys you want for bot on/off,
 *    teaching and the panel (Esc keeps the current one). Saved in this browser.
 *  - F5 (or "Set bot's keys") sets different keys for the bot to press, if you like (bonk
 *    lets one control have several keys). WDB.resetBotKeys() goes back to yours.
 *  - Everything it learns and memorizes is stored as CONTROLS (left, right, up, down, heavy,
 *    grapple), not as keyboard keys, so changing keybinds never breaks moves or lessons.
 *
 * TEACHING (F3)
 *  - Press F3: the bot stays on but YOU play. It reads your real keys (arrows, Z, X) every
 *    step along with the situation - where the ball is relative to you, how you and the ball
 *    move, when you grab and let go - and:
 *      1. learns from every moment of it (your moves count 3x a watched player's, and the
 *         rewards your play earns go into its own experience too);
 *      2. memorizes whole moves: each time something gets judged (a kickoff, a save, a shot, a
 *         pass) the move you just made is cut off the tape - the exact keys and their timing,
 *         and where the ball was through it - and kept (up to 200; WDB.moves() lists them).
 *  - Press F3 again and it plays. When a situation looks like one you made a move in, it may
 *    replay your move key for key, mirrored if it's on the other side. If the ball stops
 *    being where it was when you did it, it stops and thinks for itself again. Every replay is
 *    judged like anything else: moves that keep working get used more, ones that fail stop
 *    being used.
 *  - Kickoffs: it picks the kickoff you taught that started most like this one, holds its
 *    first keys through the countdown and plays it the moment the round begins.
 *  - The countdown: after every reset it waits - no moves, no replays - until the round has
 *    really started (anyone or the ball moves, or the countdown has run as long as it usually
 *    does; it measures that). This applies to the old brain too.
 *
 * HOW IT WORKS (the old planner brain)
 *  - Seeing the game: bonk draws with PIXI.js. This script wraps PIXI.Graphics.drawCircle
 *    (the same trick the open-source "Bonk Commands" mod uses) to find the players, then
 *    treats the ball-sized object in the current game that moves the most as the ball.
 *  - Positions are converted to bonk's 730 x 500 map units, and speeds are measured
 *    frame to frame.
 *  - Tracking: it follows the death ball, you, and every other player. Players on the
 *    other side of the barrier are enemies; throws aim at the enemy closest to the ball,
 *    leading them by where they're moving.
 *  - Offense is ON (CFG.offense = true). Set it to false for defence only: every ball it
 *    grabs is then thrown to our back wall and it goes straight back to the middle.
 *  - THE BALL KILLS: after the bot decides what to do, every move is checked against the
 *    ball's predicted path (where these keys carry us over the next 0.6 s, using the
 *    learned push and gravity). If it would bring us within killMargin of touching the
 *    ball, the bot tries every alternative (left, right, stand still, each jump straight
 *    up or sideways) and takes the one that keeps it furthest away. The panel shows the
 *    ball clearance and says AVOIDING THE BALL when this kicks in.
 *  - Saves are held: when it catches a ball that was heading for our net, it keeps hold
 *    at least 0.4 s and until letting go is safe (the ball's free flight misses our goal
 *    and us, and heads to their side). Only an empty grapple makes it let go earlier.
 *  - Offense routine (learned): for a loose ball it moves on the ground to a distance from
 *    the ball, grapple-jumps (low/regular/high - the super jump is for defence only) toward
 *    it to get above it, regrabs it in the air once it's the nearest thing, and releases at
 *    their net. Which distance and which jump work best for each ball height is learned
 *    from every attempt (+1 regrabbed, -0.3 missed, -1 died).
 *  - Regrabbing on offense: if its throw doesn't make it over, or a swing dies on the
 *    rope, it goes straight back for the ball. Throws that come back teach it to swing
 *    harder next time (throw power on the panel).
 *  - Kickoffs: it goes for the ball at the start of a round, grabs it, drags it onto our
 *    side on the rope (staying clear of our back wall), lets go once it's ours and starts
 *    its own offense on it. "kickoff WON" on the panel.
 *  - Just over its head: when a ball is about to pass over it while it's on the ground,
 *    it plans the smallest jump (and when to start it) that makes the ball the nearest
 *    thing while staying clear of it, then grabs it - a save instead of letting it by.
 *    If a jump goes wrong and the ball is about to hit it anyway, it grabs as a last resort.
 *  - Stances (freedom on defence): besides waiting in the middle it tries waiting forward,
 *    deep, or where their throws usually land, with varied reaction timing. Each is scored
 *    from how its saves went; middle stays the default unless another is clearly better
 *    after several tries. Once its saves are reliable (15 good at 60%+) it unlocks the
 *    counter stance: meet the ball early on its path, grab it and send it straight back.
 *  - Copy-first (2.7): offense, defence and kickoffs all start by looking for a move it
 *    WATCHED someone else pull off from a situation like its own (ball position and speed
 *    relative to it, distance from the barrier). If one fits it presses what they pressed,
 *    frame by frame and mirrored - moves, grapple jumps, heavy (X) - and grabs when they
 *    grabbed. Its own routines are only the fallback. Saves are recorded from the moment
 *    a thrown ball comes at a player until they've sent it back over; kickoffs from the
 *    start until someone drags the ball to their side. Every copy is scored by how it went
 *    for the bot, and one that failed isn't tried again straight away.
 *  - Heavy: it learns how hard heavy and down pull itself down, then tells them apart on
 *    other players ("HEAVY" in the reading line) and uses heavy when a copied move did.
 *  - Map: its own movement and jump predictions stop at the barrier and walls, using the
 *    map's real shapes, not just the ball's.
 *  - Not being attacked: a ball moving away from it, or drifting slowly toward their side
 *    on the floor, isn't treated as a shot at it - it's free to move and play it. The
 *    panel's "threat" line shows what it thinks.
 *  - Kickoffs are judged: GOOD (won it, ball ended up ours, took one out) or BAD (they got
 *    it first, it came flying at our net, died, they ended up with it). Kickoff approaches
 *    that go badly are dropped for a while; the tally is in the self-review line.
 *  - Reading their swing (2.8): while an opponent has the ball on the rope, it works out
 *    where each possible release in the next 0.6 s would send it (real flight, bounces),
 *    weights the dangerous ones, and leans toward where it'll come down - before they let
 *    go. It no longer jumps away from a ball that's still on their rope far away.
 *  - Copies adjust as they go: if its timing is off it skips to the frame that matches,
 *    and it steers to fix the ball being in a slightly different spot than it was for them.
 *  - Player ratings: everyone it watches gets a win rate (dangerous throws, saves that went
 *    back over, kickoffs won vs. throws that did nothing, deaths). It copies mostly from the
 *    best and ignores players who keep failing. Shown on the panel.
 *  - Planned shots: while swinging it rates "let go right now" by where the ball would really
 *    go - their net, close past a player with little time to dodge, off walls, deep on
 *    their side - and takes the shot when it's good. Sometimes it swings past the first good
 *    moment on purpose (a fake), more often when its shots have been getting read.
 *  - Teamwork: the closer teammate takes the kickoff / a loose ball while the other covers;
 *    it won't grab a ball a teammate is holding, and splits the field on incoming throws.
 *  - Export brain / Import brain buttons (top right) save what it's learned to a file and
 *    load it back (also WDB.exportBrain() / WDB.importBrain(json) in the console).
 *  - Dodging a ball dropping on it: it now picks whichever way out (left, right or straight
 *    up) keeps it clearest, instead of always jumping away from where it lands.
 *  - Synced to the game (2.9): it checks for a new game update 120 times a second and
 *    decides right after each one (up to 60 decisions a second; was a fixed 30 that ignored
 *    when the game actually updated). Speeds are measured only when the game really moves
 *    something, and copied moves are timed in milliseconds, so it reads and replays right
 *    at any rate (moves learned at 30/s still play at the right speed). The panel's
 *    "speed" line shows its real decision rate and the fps the game is drawing at.
 *  - The field (3.0): it finds the net itself - the OPEN gap at the bottom of each side wall
 *    (grey back wall above it, ceiling on top, barrier in the middle, back and centre ramps
 *    on the floor) - from the map's shapes, or assumes the standard WDB layout. No need for
 *    WDB.markGoal() any more. "Going in" is judged by following the ball's real flight at
 *    its real speed into that gap. The panel's "field" line shows what it found.
 *  - Save planner (x/y over time): for every incoming shot it tries each jump, straight up
 *    or drifting, now or later, standing or running under it, and picks the earliest
 *    moment the ball becomes the nearest thing in grapple reach without ever touching it -
 *    then jumps, and grabs at that moment. Aimed at it, over it, rolling at it, moving:
 *    all one plan. A plan that got it killed on that kind of shot is dropped for a while.
 *  - Saves follow the ball's momentum on the rope, then either spin it into a planned shot
 *    (net or player) or, if the grapple runs low, let go at the first safe moment (off the
 *    back wall if that's where it's heading).
 *  - A slow ball on our floor that isn't going in or at us = offense straight away.
 *  - Kickoffs: it gets right up to the still ball on the spike and grabs it (a still ball
 *    can't come at it, and the rope holds it off once grabbed).
 *  - Self-review, the way you described it. Defence: hit? fail (new approach). Not hit -
 *    in our net? fail. Grappled it? success. Otherwise: assumed it hit the back wall (no
 *    verdict). Offense: died setting up? fail. Grappled it and got it to their side?
 *    success, else fail. Kickoff: grabbed it? came to my side? alive after? (all three =
 *    success). Watched players are judged by the same rules.
 *  - Grapple control: learns how long a hold makes throws that get over (ours and watched)
 *    and builds the swing to that. Movement: learns where the good players wait and tries
 *    it as a stance ('copied').
 *  - Learned jumps are kept sensible (higher jump = higher, lift-off 40-300 ms).
 *  - Copies are tried less while they aren't getting the ball.
 *  - Passing (3.1): with the ball on the rope and a teammate on our side, it sometimes looks
 *    for a pass - letting go so the ball comes past a spot NEAR them (in front, behind,
 *    above, or below when they're in the air), never at them: the whole flight must stay
 *    clear of their body even if they don't grab it. No window within 1.5 s = it shoots.
 *    Learned: teammate grabbed it = good pass; missed, went in, or hurt them = bad (that
 *    spot is dropped for a while). Passes between other players are watched too. It passes
 *    more often as its passes work.
 *  - Panel: small by default (just on/off and what it's doing). F4 shows the full learning
 *    panel and the Export / Import brain buttons.
 *  - The same shot again (3.2): every incoming shot is remembered by kind, angle and speed
 *    with the save it used and how it went. When that shot comes again it reuses what
 *    worked and won't repeat what failed (and a plan that got it killed is dropped).
 *  - Defence reacts, it doesn't guess: no jumping while the ball is still on their rope
 *    (it can reposition); the moment it's released, the save is planned at once. A plan
 *    waiting to jump is trusted over the dodge when it keeps room to spare.
 *  - It knows whether a shot bounces on the floor before reaching it or hits it in the air.
 *  - Air moves on defence: a grapple tap at the top of a jump for extra height (without
 *    committing fully), a balloon (hold up + grapple near the top and hang - it can grab the
 *    ball if it passes under or over), and a super jump out of the balloon. It can always
 *    let go of the floor and grab the ball, even mid super jump. It measures what each move
 *    really does in your game and only keeps using the ones that work.
 *  - A save only counts if the ball doesn't still go in afterwards.
 *  - Every player: x/y, rope length and how long they've held the ball, and an estimate of
 *    their grapple meter (full panel, or WDB.players() in the console).
 *  - The grab clock (3.3): if the ball sits loose on our side for 3 s (or 2.5 s at kickoff)
 *    without it grabbing it, whatever it was trying (pickup approach, kickoff approach,
 *    copied move) is punished and dropped for a while, and it tries something else - again
 *    every further 3 s until it gets the ball. Not while a teammate has it, and an attempt
 *    already in the air gets to finish first. Change the times with grabDeadlineMs /
 *    kickoffDeadlineMs. The status line shows the clock.
 *  - Kickoffs (3.4): grabbing the ball = success. If nobody has it yet (knocked off the
 *    spike, loose in the middle) it does NOT go back to wait in the middle - it keeps going
 *    for it until someone grabs it. They grab it first, the ball reaches their side, or it
 *    dies = fail. The ball clock starts over every round. The grab clock keeps punishing
 *    slow kickoff approaches every 2.5 s while it's still fighting for it.
 *  - Grab while avoiding (3.5.1): when it's dodging the ball and even the best dodge is a
 *    close call, and the ball is the nearest thing in grapple reach, it grapples it instead
 *    (on the rope beats a near miss). avoidGrabGap sets how close a call counts - make it
 *    999 to grapple whenever the ball is nearest while avoiding.
 *  - Caught shots (saves): no ball control. Momentum already carrying it their way = let go
 *    straight away at their net. Otherwise let go the moment it'll hit our back wall (above
 *    the net, never dropping into it, and not rebounding at us). Otherwise hold it only until
 *    it's safely heading their way and let go - no aiming, no extra swinging.
 *  - 3.6: a shot rolling along the floor is only defended with a low or regular jump (over it
 *    or catching it). Saves never drag it toward its own back wall, and a save is only let go
 *    when the ball will really reach their side. Movement predictions know it can't cross the
 *    barrier. Angled super jump: holding left/right while pressing X+Z angles the jump - it
 *    measures how much and plans with it (never angled toward a close low ball).
 *    Simulator: 96.5% of shots defended (both sides), 107/120 loose balls thrown over.
 *  - 5.0 - NO RULES (CFG.planner = true, the default): every decision is made the same way -
 *    imagine the futures each choice leads to and pick the best-scoring one. On the ground:
 *    is there a jump that leads to a catch (a save, a pickup and a kickoff grab are all the
 *    same thing: +500)? Jump now, wait for it, or move with the feet by scoring futures. In
 *    the air: grab the moment the ball is the nearest thing, otherwise steer toward the
 *    best future. Holding the ball: let go when now is the best release in sight (into
 *    their net +1000, hard to dodge, over to their side +300, to a teammate +350, back on
 *    our side -100, into our net or into us -1000), otherwise keep swinging. The never-touch
 *    check stays as the one hard limit. What it learns (jumps, push, bounce and rolling
 *    friction of the ball, shots, top players' moves) all feeds the predictions.
 *    CFG.planner = false brings back the rule-based bot (4.0 behaviour).
 *  - 4.0 - future-scoring planner (model predictive control): when there's no jump to make,
 *    it imagines holding left / right / nothing, works out where it and the ball would be,
 *    runs the save planner from there and scores each future (touching the ball = thrown
 *    out, a catch = +500 and sooner is better, ball going in with no catch = -1000, a bonus
 *    for what top players did in that spot). It does whatever leads to the best future -
 *    replacing the fixed "get under it / step aside / walk to the read spot" rules on
 *    defence. CFG.mpc = false brings the old rules back.
 *  - State-matched copying: every moment of a good player's successful save is remembered
 *    as "situation -> how they moved" (ball position/speed relative to them, their speed).
 *    In a similar situation the closest remembered moments vote, and that's a bonus in the
 *    future scoring - a suggestion, never a macro, so a misread can't make it do something
 *    unsafe. (Their keys are guessed from how they accelerate.)
 *  - Red/blue: everything it learns is stored as if it were on the left, and mirrored
 *    (left <-> right swapped, up/down unchanged) when it plays or watches on the right.
 *  - How it plays: it watches the ball's height, speed and angle (gravity is measured
 *    automatically) rather than the players.
 *      ball on their side     -> get to the middle of our side and hold it there,
 *                                constantly tapping left/right to cancel any sliding
 *      ball on our side       -> free to move:
 *        coming in low at us  -> jump over it, grab it from above, throw at their net
 *        dropping onto us     -> time a jump sideways out of the way, then grab it
 *        into our net / over our head / going backwards
 *                             -> get under it, jump up and grab it, throw at their net
 *        moving away from our net -> let it go
 *        loose on the floor   -> line up, jump over it and grab it, then the set-up play:
 *                                throw it to our back wall, go to the ramp, grab it again
 *                                and throw it at their net straight away
 *  - Offense: it watches the opponent's throws (release spot, height, angle, speed, whether
 *    they jumped), scores each by how dangerous it was to us, and copies the best ones
 *    when it throws. Its own throws are scored too (+1 if an opponent dies or it reaches
 *    their net). Held keys are re-pressed every 0.3 s so none get dropped.
 *    It also watches the opponent's defensive jumps (how high, on what kind of ball, did
 *    it save it) and uses them to help pick its own jumps. Without a marked ramp, the
 *    set-up play goes to the spot the opponent's best throws came from.
 *  - Copying the opponent's movement: bonk doesn't show anyone's key presses, so the bot
 *    reads them from motion. It learns how hard its own left/right/up push it, then
 *    reads the opponent's accelerations (and the steady rope distance while they hold the
 *    ball) as inputs. Each opponent shot is recorded from just before they grab the ball
 *    to the release, scored by how dangerous it was, and the best ones are replayed
 *    input-for-input (mirrored) when the bot throws, with a check that the ball stays
 *    where it was for them; if it drifts, it finishes with a normal throw.
 *  - Grabbing: the grapple latches onto the nearest thing in reach, so the bot only
 *    grapples the ball when it's clearly closer than the ground, walls and everything else.
 *    Whenever it's in the air and that's true, it grabs.
 *  - Defend first: threats are always handled before offense, and a set-up in progress
 *    is dropped the moment the ball becomes a threat. A ball that gets past it is
 *    chased and regrabbed from behind.
 *  - Jumps (all start by grappling the ground with Z):
 *      low = short Z tap, regular = Z, high = Up + Z, super = Up + X + Z
 *    It measures how high each one really goes, and learns which jump works for each
 *    kind of shot (ball height x angle). Learning is saved in the browser, so it keeps
 *    improving across sessions. WDB.brain() shows it, WDB.forget() resets it.
 *  - Grapple: 5 s of use, 5 s to refill. A radar tracks everything within grapple reach;
 *    the grapple grabs the nearest thing, so the bot only grapples when the right thing
 *    (the ball, or the ground for a jump) is nearest.
 *  - Our goal: stand in front of your goal and run WDB.markGoal() in the console.
 *    Until then the bot can't tell when a ball is heading for the goal.
 *  - Controls: keys are sent as keydown/keyup events on bonk's #gamerenderer element.
 *  - F2 toggles the bot on/off. The panel (top-left) shows its mode and what it sees.
 *
 * IF THE PANEL SAYS...
 *  - "can't find you": set CFG.myName below to your exact bonk username.
 *  - "no ball yet": the ball hasn't moved yet this round; it picks it up once it does.
 *  - Nothing shows up at all after reloading: reload the page with the bot installed
 *    BEFORE joining a room, so the hook is in place before bonk draws anything.
 *
 * Console helpers (DevTools console set to the gameframe-release.html frame):
 *  WDB.debug()            print what the bot currently sees
 *  WDB.markGoal()         remember where your goal is (stand in front of it first)
 *  WDB.markWait()         wait where you're standing now instead of mid-half
 *  WDB.markRamp()         remember the ramp near your goal (stand on it first)
 *  WDB.brain()            show what it has learned;  WDB.forget() to reset it
 *  WDB.CFG.myName = "..." set your username
 *  WDB.CFG.<setting> = n  tune any setting live
 */

(function () {
  'use strict';

  // ---------------- CONFIG (tune these) ----------------
  const CFG = {
    myName: '',            // your bonk username; leave '' to auto-detect
    tickMs: 1000 / 180,    // fastest it decides (180 a second). It decides right after each new game
                           // update (synced to the game), never faster than this, and at least
                           // every 50 ms. Moves are timed in ms, so any rate replays right.
    pollMs: 1000 / 240,    // how often it checks for a new game update
    toggleKey: 'F2',
    // Map geometry, in bonk's 730 x 500 units
    midX: 365,             // x of the middle barrier
    aimY: 250,             // height to aim throws at
    ballMinMoved: 5,       // an object must have moved this far before it counts as the ball
    flightHorizon: 2.0,    // seconds of ball flight simulated (with bounces) each tick
    bounceDetect: 120,     // a sudden change in ball speed this big near a surface = a bounce
    showMap: false,        // draw what the bot thinks the map is on top of the game (WDB.showMap())
    ballMinSize: 6,        // the ball's width/height must be between these (map units)
    ballMaxSize: 70,
    // Behaviour
    gravity: null,         // ball gravity (units/s^2, y-down); null = measure it automatically
    lookahead: 0.6,        // seconds of ball-path prediction for dodging
    dangerRadius: 45,      // predicted miss distance that triggers a dodge
    // THE BALL KILLS: every move is checked against the ball's path before it's made
    killMargin: 10,        // keep at least this gap (surface to surface) from the ball
    stillKillMargin: 3,    // ...a ball sitting still (kickoff) can't come at us: get this close to grab it
    stillSpeed: 40,        // a ball slower than this counts as sitting still
    safetyHorizon: 0.9,    // seconds ahead to check a move against the ball
    maxRunSpeed: 250,      // top sideways speed assumed when predicting our movement
    safeEnough: 30,        // any option this clear of the ball counts as fully safe (then the least
                           // drastic one wins). 30 tested safer on defence than smaller values.
    commitTime: 0.15,      // the bot's own moves: held this long, then we must be able to stop
    afterLandingCheck: 0.4,// keep checking this long after a jump lands
    hoverTolerance: 6,     // offense jump: steer to within this of being right over the ball
    backWallGap: 45,       // never walk closer than this to our back wall (no getting cornered)
    safetyMaxWait: 0.5,    // consider standing still up to this long before jumping
    safetyWaitStep: 0.066, // ...in steps of this
    grabMin: 30,           // too close = risky to grab
    grabIdeal: 75,         // where we try to stand before grabbing a resting ball
    // Grapple
    grappleRange: 110,     // how far the grapple reaches
    playerRadius: 12,      // your ball's radius, for distances to surfaces
    grappleMaxMs: 5000,    // grapple can be held this long in total...
    grappleRecoverMs: 5000,// ...and takes this long to refill from empty (locked until full)
    carryMinMs: 800,       // don't grab the ball with less grapple than this left
    wallMargin: 20,        // stay this far from our side of the barrier
    releaseTolerance: 0.3, // radians of aim error allowed at release
    minThrowSpeed: 150,    // don't release a slow ball
    // Offense: ON. Grabs from a save are thrown at their net (copying the opponent's best
    // throws / replaying their recorded shots when it has good ones); loose balls start
    // the set-up play. Set to false to go back to defence only (every grab cleared to our
    // back wall, then straight back to the middle).
    offense: true,
    kickoffs: true,        // go for the ball at the start of a round instead of waiting in the middle
    kickoffZone: 60,
    kickoffApproachSpeed: 110, // approach the kickoff ball slowly enough to stop on the spot
    kickoffDragDepth: 90,  // kickoff won = ball dragged at least this far into our side...
    kickoffDragMaxMs: 1800,// ...within this long (then it attacks from wherever it is)
    kickoffAttackReserveMs: 1500, // stop dragging with this much grapple left for the attack
    lowSaveReach: 130,     // a ball passing this close over our head can be jump-saved (the planner checks it)
    lowSaveLead: 0.12,     // jump this long (plus lift-off) before it passes over
    stanceForward: 0.45,   // 'forward' stance: this share of the way from the middle to the barrier
    stanceDeep: 0.4,       // 'deep' stance: this share of the way from the middle to our back
    stanceExplore: 0.15,   // how often it tries a different stance
    stanceMinTries: 5,     // a stance must be tried this often before it can replace middle...
    stanceMargin: 0.2,     // ...and score this much better
    counterUnlockSaves: 15,// the counter ('meet') stance unlocks after this many good saves...
    counterUnlockRate: 0.6,// ...at this save success rate or better
    counterHoldMs: 150,    // a counter grab is held only briefly (but still until it's safe to let go)
    deepLanding: 120,      // a throw landing this far into their side is good enough (after a while)       // a still ball within this of the barrier counts as the kickoff ball
    tabuMs: 30000,         // something that just failed isn't tried again for this long
    unpredictBase: 0.1,    // minimum randomness in its shots
    maxAimJitter: 0.35,    // radians of random aim offset at full unpredictability
    vsMemory: 8,           // recent shots remembered per opponent
    offenseJumps: ['low', 'regular', 'high'], // grapple jumps used on offense (super is defence only)
    pickupDists: [45, 60, 75, 90],  // distances from a loose ball it tries jumping from (learned)
    pickupPlanMs: 4000,    // re-pick the approach if it hasn't jumped within this long
    clearIgnoreMs: 1200,   // after clearing to our back wall, don't chase it for this long
    // Throwing after a save
    ramp: null,            // set with WDB.markRamp(); carry the ball here before throwing
    rampTolerance: 15,     // close enough to the ramp to throw
    maxCarryMs: 2500,      // give up walking to the ramp after this long and just throw
    throwMaxMs: 900,       // longest swing before letting go anyway
    throwReserveMs: 600,
    // Holding saves / regrabbing on offense
    saveHoldMs: 400,       // a save is held at least this long...
    saveAwaySpeed: 60,     // ...and until the ball is heading to their side at least this fast
    saveMaxMs: 2500,       // a save gives up waiting for a good release after this (if it's safe)
    throwHardMaxMs: 4000,  // absolute longest hold
    stallMs: 700,          // offense: a swing slower than stallSpeed after this long has died...
    stallSpeed: 60,        // ...so let go and regrab
    regrabWindowMs: 2000,  // how long to go straight back for a lost ball
    maxThrowPower: 2,      // learned throw power never goes above this   // throw immediately if the grapple is about to run out
    // Jumping: in WDB, grappling the floor boosts you upward
    floorY: null,          // your height when standing on the floor; null = learn it automatically
    floorNear: 15,         // how close to the floor counts as "standing on it"
    jumpLead: 0.2,         // extra time on top of the learned lift-off delay when jumping over a ball
    jumpGrappleMs: 150,    // how long to hold grapple on the floor for the boost
    jumpMs: 700,           // how long a jump lasts before normal play resumes
    jumpCooldownMs: 300,   // wait this long after a jump before jumping again
    jumpMinBallDist: 25,   // if the ball is closer than this, the grapple would grab it instead
    regrabGapMs: 120,      // pause between letting go of the floor and grappling the ball
    // Waiting, reading throws and saving
    waitFromBarrier: null, // where to wait, as distance from the barrier; null = middle of our half
    standStill: 8,         // close enough to the target spot to stop moving
    positionTolerance: 12, // close enough to the middle of our side
    centerMargin: 15,      // the ball within this of the barrier counts as neither side
    keyRefreshMs: 300,     // re-press held keys this often (bonk can drop keys)
    // Balancing in the middle (constant small left/right taps)
    balanceGain: 4,        // target speed = distance off x this (per second)
    balanceMaxSpeed: 120,  // top speed when correcting once in position
    positionMaxSpeed: 260, // top speed when first getting into position
    balanceBand: 12,       // speed error allowed before tapping left/right
    balanceDeadzone: 2,    // this close and nearly still = don't touch anything
    settleSpeed: 25,       // slower than this counts as stopped

    incomingSpeed: 60,     // ball faster than this counts as thrown, not rolling
    backwardsSpeed: 45,    // ball moving toward our net faster than this = going backwards
                           // (a ball just drifting slowly isn't an attack)
    freeRollSpeed: 260,    // a ball on our side heading to theirs slower than this is ours to play
    copyFirst: 0.8,        // chance to try a watched move before our own routine (when one fits),
                           // scaled down while copies aren't actually getting the ball
    airBoostMs: 70,        // a grapple tap in the air (ground nearest) for extra height
    balloonMaxMs: 1200,    // longest it hangs in a balloon (up + grapple held near the top of a jump)
    saveClearMs: 700,
    saveNoBackPush: true,  // while holding a save, never push toward our own back wall
    saveShotMinMs: 80,     // after catching a shot, wait at least this long before letting go
    grabDeadlineMs: 3000,  // ball loose on our side this long without us grabbing it = punished
    kickoffDeadlineMs: 2500, // kickoff: not grabbed this long after it starts = punished
    slowPenalty: 0.5,      // how much a too-slow approach loses (and it's dropped for a while)
    earlySaveT: 0.5,
    planTrustGap: 15,
    mpc: true,             // future-scoring movement (off = the old fixed movement rules)
    planner: true,         // NO RULES: every decision (ground, air, holding the ball) by scoring
                           // imagined futures. false = the old rule-based bot.
    cloneBonus: 60,
    spotWeight: 1.0,       // future scoring: cost per unit away from where it wants to be (no catch in sight)
    swingPatienceMs: 1500,
    waitCost: 400,
    holdValue: 300,
    solidCross: 70,        // a throw only counts as "over" in the scoring once it's this far past the barrier        // what keeping hold of the ball (to swing it up) is worth at full grapple         // holding on for a better release costs this much per second (it may never come) // holding the ball longer than this, a safe "meh" release beats swinging on        // how much "a top player moved like this here" counts in the scoring
    knnMax: 4000,          // situations remembered for state-matched copying
    avoidGrabGap: 8,       // dodging, but even the best dodge passes this close: grapple it if it's the nearest thing       // a waiting save plan that keeps this much extra gap is trusted over the dodge       // before it reaches our side, only jump if the planned catch is this soon (s)      // a save with less grapple than this (above the reserve) is let go at the first safe moment
    slowRoll: 150,         // a ball on our floor slower than this (not going in / at us) = offense
    copyMatch: 70,         // how close our situation must be to where theirs started
    copyDrift: 75,         // give up a copy if the ball drifts this far from where theirs was
    copyTop: 3,            // pick among this many best-fitting watched moves (variety)
    maxCopies: 40,         // watched defence / kickoff moves to remember (each)
    kickoffJudgeMs: 3500,
    anticipate: 0.5,       // how far to lean toward where their swing is likely to send it (0 = never)
    anticipateMax: 90,     // ...but never more than this far from our spot
    copyNudge: 18,         // a copy steers to fix the ball being this far off where theirs was
    shotGood: 0.6,         // a release-now shot rated at least this is taken
    fakeChance: 0.15,      // sometimes skip the first good release (a fake), more when predictable
    teamGap: 40,           // a teammate this much closer to the ball takes it; we cover
    passing: true,         // pass to teammates (near them - never at them - so they can grab it)
    passChance: 0.12,      // to start with, how often it looks for a pass when it has the ball;
                           // grows as passes work (up to passChanceMax)
    passChanceMax: 0.5,
    passOffset: 45,        // how far in front of / behind / above / below the teammate it aims
    passClear: 18,         // the ball must stay at least this far (surface gap) from the teammate
    passMaxMs: 1500,       // look for the pass window this long, then shoot instead
    panelFull: false,      // the full learning panel (F4 toggles); off = just the bot's status
    // ---- The learning brain (pure machine learning) ----
    ml: true,              // true = the neural-network brain that learns everything itself;
                           // false = the old planner brain (WDB.CFG.ml = false to switch back)
    mlHz: 40,              // decisions a second (bonk's physics updates ~30 a second)
    mlWorker: true,        // train in a background thread (no lag); falls back to light training
    mlTrainPerTick: 1,     // background training pace: updates per slice...
    mlTrainPauseMs: 12,    // ...and the pause between slices (keeps that thread from hogging a core)
    mlLocalTrain: 2,       // updates every 250 ms when a background thread isn't allowed
    mlGamma: 0.99,         // how much it cares about what happens later vs right now
    mlNStep: 8,            // how many steps a reward reaches back
    mlEps: 0.3,            // exploration: tries something other than its best guess this often at first...
    mlEpsMin: 0.04,        // ...never less than this...
    mlEpsHalfLife: 60000,  // ...halving every this many decisions (~25 min of play)
    mlImitate: 0.6,        // how much "what good players do here" counts next to "what it learned works"
    // rewards and punishments it learns from (from its own self-review)
    mlRewardDeath: -1, mlRewardSaveGood: 0.6, mlRewardSaveBad: -0.8, mlRewardShotGood: 0.5, mlRewardShotBad: -0.3,
    mlRewardKickGood: 0.6, mlRewardKickBad: -0.4, mlRewardSlow: -0.2, mlRewardPassGood: 0.4, mlRewardPassBad: -0.5,
    mlRewardCatch: 0.2, mlRewardCatchSave: 0.3,
    mlRewardTerritory: 0.002,
    mlDeathDist: 70,       // gone while the ball was this close = killed by it (otherwise the round just ended) // a trickle each step: + while the ball is on their side, - while it's on ours
    // ---- Not lagging the game ----
    // ---- Teaching (F3): you play, it watches you and memorizes your moves ----
    teachKey: 'F3',
    bindKey: 'F6',         // set your keybinds (it asks you to press each one)
    botBindKey: 'F5',      // set the keys the BOT presses, if you want them different from yours
    teachWeight: 3,        // your moments count this many times a watched good player's
    teachIdleMs: 300,      // a pause this long (no keys) before pressing again = the start of a new move
    clipMaxMs: 6000,       // a memorized move is at most this long (kickoffs 2 s more)
    clipMax: 200,          // moves kept (when full, the worst one is forgotten)
    clipMinScore: 0.4,     // only moves doing at least this well are replayed
    clipMatch: 0.6,        // how alike the situation must be to the one you made the move in
    clipMatchKick: 1.5,    // the same for kickoffs (spawn spots vary a little)
    clipUse: 0.85,         // chance of using a fitting move (times how well it's been working)
    clipDiverge: 100,      // stop a replay if the ball is this far from where it was when you did it
    clipCreditMs: 2500,    // a verdict this soon after a replay ends still counts for that move
    countdownMs: 3000,     // how long bonk's countdown is, until it has measured it
    panelHz: 4,            // panel refreshes a second
    saveEveryMs: 20000,    // save what it learned at most this often (and when you leave the page)
    ballRescanMs: 250,     // full search for the ball this often; in between only the ball is read
    panelKey: 'F4',  // how long after a kickoff starts before judging it
    lowJumpMs: 70,         // ground-grapple time: LOW jump (Z tap)
    highJumpMs: 260,       // ground-grapple time: HIGH jump (Up + Z)
    superJumpMs: 260,      // ground-grapple time: SUPER jump (Up + X + Z)
    jumpClearance: 12,     // extra height to clear the ball when jumping over it
    jumpSafety: 8,         // extra gap to keep from the ball along the whole jump
    dodgeLead: 0.45,       // jump out of the way when a dropping ball is this many s away
    jumpOverDist: 70,      // how far from a loose ball to stand before jumping over it
    // Learning
    learnRate: 0.5,        // how fast it learns (0-1): high = learns from each jump quickly
    explore: 0.35,         // chance of trying a different jump to learn (shrinks with experience)
    exploreMin: 0.08,      // ...but never below this
    outcomeMs: 2500,       // how long to wait to judge whether a jump worked
    // Offense learning (copying the opponent's throws)
    copyMinSpeed: 150,     // an opponent's throw must be at least this fast to be copied
    imitateWeight: 0.6,    // how much a watched opponent jump counts vs. one of our own
    watchJumpRange: 250,   // only learn from opponent jumps made this close to the ball
    // Reading and copying the opponent's movement
    moveLearnRate: 0.15,   // how fast our own movement model updates (noisier, so slower)
    inputThreshold: 0.4,   // accel above this share of our key push = they're pressing it
    ropeSteady: 6,         // ball-player distance changing less than this = on the rope
    moveMemoryMs: 4000,    // how much of each opponent's recent movement to keep
    approachMs: 1300,      // how much of their approach is kept before they took hold of the ball (ground + jump)
    maxMoves: 12,          // recorded opponent shots to remember
    moveMinScore: 0.5,     // only replay shots at least this dangerous
    replayDrift: 60,       // give up a replay if the ball is this far off where theirs was
    replayCorrectMs: 300,  // after their release point, keep swinging this long to match their angle
    // Grabbing
    nearestMargin: 6,      // the ball must be this much closer than anything else to grab it
    readBack: 25,          // when a ball is released at us, wait this far behind where it comes down
    releaseMargin: 12,     // ball must pull this much further from the opponent to count as thrown
    releaseWindowMs: 600,  // ...within this long of them last holding it
    noRegrabMs: 400,       // after throwing, don't grab again for this long
    grabSafeWindow: 0.6,   // the ball must stay clear of us this long after we grab it (0.25 tested less safe)
    grabSafety: 6,         // grab unless the ball would come within this of touching us
    grabVerifyMs: 200,     // after grabbing, check the rope caught the ball after this long...
    grabMissSlack: 35,     // ...and let go to regrab if it's pulled this much further away
    copySpeedFactor: 0.8,  // release when at least this fraction of the copied throw's speed
    playMinScore: 0.25,    // only copy plays scoring above this
    maxPlays: 40,          // how many plays to remember
    // Set-up play: throw to our back wall, go to the ramp, grab it, throw at their net
    setupPlay: false,      // back-wall set-up play (needs WDB.markRamp()); off: offense throws straight at their net
    setupThrowSpeed: 100,  // a softer throw is fine for the back wall
    backWallHeight: 80,    // aim this high up our back wall
    setupBallSpeed: 150,   // wait until the ball is slower than this before grabbing it
    setupMaxMs: 4000,      // give up on the set-up after this long
    lowJumpReach: 40,      // start a low defend jump when the ball is this far past grapple range
    pathLookahead: 1.5,    // seconds of ball path to predict when reading a throw
    goal: null,            // set with WDB.markGoal(); { side, x, y }
    goalRadius: 40,        // how close the ball's path must pass to the goal to count as on target
    saveLead: 0.25,        // run to where the ball will be this many seconds ahead
    // Aiming at the other players
    throwSpeedGuess: 350,  // rough speed of a thrown ball, used to lead a moving enemy
  };

  // NO keys until you set them (F6): until then the bot presses nothing and teaching reads nothing.
  const KEYS = { left: null, up: null, right: null, down: null, grapple: null, heavy: null }; // heavy = X-style key (super jump)

  // ---- YOUR KEYBINDS: the bot presses (and, when teaching, reads) the keys YOU play with.
  //      Set them once with F6 (or the "Set my keys" button / WDB.setKeys()): it asks you to
  //      press each control in turn, plus the keys for bot on/off, teaching and the panel.
  //      Saved in this browser. Until then it tries to find bonk's own saved controls, and
  //      otherwise uses bonk's defaults (arrows, X heavy, Z grapple).
  const BIND_KEY = 'wdbKeybinds';
  const BIND_STEPS = [
    ['left', 'LEFT'], ['right', 'RIGHT'], ['up', 'UP'], ['down', 'DOWN'], ['heavy', 'HEAVY (X)'], ['grapple', 'GRAPPLE / special (Z)'],
    ['toggleKey', 'turn the BOT ON/OFF'], ['teachKey', 'TEACHING mode'], ['panelKey', 'show the FULL PANEL'],
  ];
  const HOTKEYS = ['toggleKey', 'teachKey', 'panelKey'];
  // The keys the BOT presses. Normally the same as yours; F5 sets different ones if you like
  // (e.g. you play on WASD and give the bot the arrows - bonk lets one control have several keys).
  const BOT_BIND_KEY = 'wdbBotKeybinds';
  let BOT_KEYS = {};
  try { const b = JSON.parse(localStorage.getItem(BOT_BIND_KEY)); if (b && typeof b === 'object') BOT_KEYS = b; } catch (e) { /* none */ }
  const botKey = (name) => BOT_KEYS[name] || KEYS[name];
  const CODE_OF = { 32: 'Space', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
                    186: 'Semicolon', 188: 'Comma', 190: 'Period', 191: 'Slash', 219: 'BracketLeft', 221: 'BracketRight', 222: 'Quote' };
  const keyFromCode = (kc) => {
    const code = kc >= 65 && kc <= 90 ? 'Key' + String.fromCharCode(kc) : kc >= 48 && kc <= 57 ? 'Digit' + (kc - 48) : CODE_OF[kc];
    if (!code) return null;
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5)
      : code === 'Space' ? ' ' : code.replace(/Left$/, '') === code ? code : code.replace(/Left$/, '');
    return { key, code, keyCode: kc };
  };
  let bindSource = `NOT SET - press ${CFG.bindKey}`;
  function applyBinds(b) {
    for (const n of Object.keys(KEYS)) if (b && b[n] && b[n].code && b[n].keyCode) KEYS[n] = { key: b[n].key, code: b[n].code, keyCode: b[n].keyCode };
    if (b && b.hotkeys) for (const h of HOTKEYS) if (b.hotkeys[h]) CFG[h] = b.hotkeys[h];
  }
  // bonk's own saved controls, if they can be found in this browser's storage (all six or nothing)
  function findBonkBinds() {
    const alias = { left: /^left/i, right: /^right/i, up: /^(up|jump)/i, down: /^down/i, heavy: /^heavy/i, grapple: /^(special|grapple|grab)/i };
    const firstCode = (v) => { if (typeof v === 'number' && v > 7) return v; if (Array.isArray(v)) for (const x of v) { const c = firstCode(x); if (c) return c; } return 0; };
    const look = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 3) return null;
      const out = {};
      for (const [k, v] of Object.entries(o)) for (const [n, re] of Object.entries(alias)) if (!out[n] && re.test(k)) { const kc = firstCode(v); const kk = kc && keyFromCode(kc); if (kk) out[n] = kk; }
      if (Object.keys(out).length === 6) return out;
      for (const v of Object.values(o)) { const r = look(v, depth + 1); if (r) return r; }
      return null;
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === BIND_KEY || k === 'wdbBotBrain') continue;
        let v; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
        const r = look(v, 0);
        if (r) return r;
      }
    } catch (e) { /* no storage */ }
    return null;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(BIND_KEY));
    if (saved) { applyBinds(saved); bindSource = 'your keys (set with F6)'; }

  } catch (e) { /* defaults */ }
  const keyLabel = (k) => (!k ? 'not set' : k.key === ' ' ? 'Space' : k.key.length === 1 ? k.key.toUpperCase() : k.key.replace('Arrow', ''));
  const noKeys = () => !Object.keys(KEYS).some((n) => botKey(n)); // nothing set yet: the bot can't press anything
  const bindsText = () => Object.entries(KEYS).map(([n, k]) => `${n} ${keyLabel(k)}`).join(', ') +
    (Object.keys(BOT_KEYS).length ? ` | the bot presses: ${Object.keys(KEYS).map((n) => `${n} ${keyLabel(botKey(n))}`).join(', ')}` : '') +
    ` | bot ${CFG.toggleKey}, teach ${CFG.teachKey}, panel ${CFG.panelKey}, your keys ${CFG.bindKey}, bot's keys ${CFG.botBindKey}`;
  // the key-setting walk-through
  let bindStep = null, bindNew = null, bindPrompt = '', bindFor = 'you';
  const bindSteps = () => (bindFor === 'bot' ? BIND_STEPS.filter(([n]) => !HOTKEYS.includes(n)) : BIND_STEPS);
  const bindTitle = () => (bindFor === 'bot' ? "SET THE BOT'S KEYS: press the key the bot should use for" : 'SET YOUR KEYS: press your');
  const bindCurrent = (n) => (HOTKEYS.includes(n) ? CFG[n] : keyLabel(bindFor === 'bot' ? botKey(n) : KEYS[n]));
  function startBinding(forWho = 'you') {
    bindFor = forWho; bindStep = 0; bindNew = { hotkeys: {} };
    try { releaseAll(); } catch (e) { /* not ready */ }
    bindPrompt = `${bindTitle()} ${bindSteps()[0][1]}  (Esc = keep ${bindCurrent(bindSteps()[0][0])})`;
    try { render(''); } catch (e) { /* no panel yet */ }
  }
  function bindingKey(e) { // returns true if the key was used by the walk-through
    if (bindStep == null || !e.isTrusted) return false;
    e.preventDefault(); e.stopImmediatePropagation();
    const steps = bindSteps();
    const [name] = steps[bindStep];
    if (e.key !== 'Escape') {
      if (HOTKEYS.includes(name)) bindNew.hotkeys[name] = e.key;
      else bindNew[name] = { key: e.key, code: e.code, keyCode: e.keyCode || (keyFromCode(e.keyCode) || {}).keyCode };
    }
    bindStep++;
    if (bindStep >= steps.length && bindFor === 'bot') {
      const nb = {};
      for (const n of Object.keys(KEYS)) { const k = bindNew[n] || BOT_KEYS[n]; if (k && k.code !== (KEYS[n] && KEYS[n].code)) nb[n] = k; }
      BOT_KEYS = nb;
      try { localStorage.setItem(BOT_BIND_KEY, JSON.stringify(nb)); } catch (err) { /* storage blocked */ }
      bindStep = null; bindPrompt = '';
      lastLesson = `bot keys set: ${Object.keys(KEYS).map((n) => `${n} ${keyLabel(botKey(n))}`).join(', ')}`;
    } else if (bindStep >= steps.length) {
      const merged = {};
      for (const n of Object.keys(KEYS)) merged[n] = bindNew[n] || KEYS[n];
      merged.hotkeys = {}; for (const h of HOTKEYS) merged.hotkeys[h] = bindNew.hotkeys[h] || CFG[h];
      applyBinds(merged);
      try { localStorage.setItem(BIND_KEY, JSON.stringify(merged)); } catch (err) { /* storage blocked */ }
      bindSource = 'your keys (set with F6)';
      bindStep = null; bindPrompt = '';
      try { userHeld.clear(); lastLesson = `keys set: ${bindsText()}`; } catch (err) { /* ignore */ }
    } else {
      const [n2, label] = steps[bindStep];
      bindPrompt = `${bindTitle()} ${label}  (Esc = keep ${bindCurrent(n2)})`;
    }
    try { render(''); } catch (err) { /* ignore */ }
    return true;
  }

  const BONK_W = 730;

  // ---------------- SEEING THE GAME (PIXI hook) ----------------
  const circles = new Set();     // PIXI Graphics objects that have drawn a circle
  const track = new WeakMap();   // Graphics -> { x, y, vx, vy, t, moved }
  let stateProvider = null;      // optional override for testing
  let waitReason = 'starting';
  let learnedFloorY = null;
  let wasAlive = false;
  let lastRoot = null;           // the game we were last in (kept while dead, to keep watching)
  let lastSide = 'left';
  let gravityEst = 0;            // measured ball gravity (units/s^2, y-down)

  let rehooks = 0;               // how many times the hook had to be put back (diagnostics)
  let lastPixi = null;
  let pixiSwaps = 0;

  function hookPixi() {
    const PIXI = window.PIXI;
    if (!PIXI || !PIXI.Graphics || !PIXI.Graphics.prototype.drawCircle) return false;
    if (lastPixi && PIXI !== lastPixi) pixiSwaps++;
    lastPixi = PIXI;
    const proto = PIXI.Graphics.prototype;
    const wrap = (name, record) => {
      const orig = proto[name];
      if (typeof orig !== 'function' || orig.__wdbHooked) return;
      const hooked = function (...args) {
        try { record(this, args); } catch (e) { /* never break bonk's drawing */ }
        return orig.apply(this, args);
      };
      hooked.__wdbHooked = true;
      proto[name] = hooked;
      rehooks++;
    };
    // Every shape is recorded in the graphic's own coordinates; the map is built from these
    // (see MAP AWARENESS below).
    const geo = (g) => (g.__wdbGeo = g.__wdbGeo || []);
    wrap('drawCircle', (g, a) => {
      g.__wdbR = a[2]; // remember the radius for diagnostics
      geo(g).push({ type: 'circle', x: +a[0], y: +a[1], r: +a[2] });
      // bonk attaches the graphic to its container after drawing, so check a tick later
      setTimeout(() => { if (g.parent) circles.add(g); }, 0);
    });
    wrap('drawRect', (g, a) => geo(g).push({ type: 'rect', x: +a[0], y: +a[1], w: +a[2], h: +a[3] }));
    wrap('drawRoundedRect', (g, a) => geo(g).push({ type: 'rect', x: +a[0], y: +a[1], w: +a[2], h: +a[3] }));
    wrap('drawEllipse', (g, a) => geo(g).push({ type: 'ellipse', x: +a[0], y: +a[1], rx: +a[2], ry: +a[3] }));
    wrap('drawPolygon', (g, a) => {
      let p = a.length === 1 ? a[0] : a;
      if (p && p.points) p = p.points;                       // PIXI.Polygon
      const flat = [];
      for (const v of p) { if (typeof v === 'number') flat.push(v); else if (v) flat.push(+v.x, +v.y); }
      if (flat.length >= 6) geo(g).push({ type: 'poly', pts: flat });
    });
    wrap('clear', (g) => { g.__wdbGeo = []; });
    return proto.drawCircle.__wdbHooked;
  }
  // Keep checking forever: bonk (or another mod) can replace PIXI or the hook later on.
  hookPixi();
  setInterval(hookPixi, 100);

  // A player's container holds a text object with their name.
  function nameOf(g) {
    const kids = g.parent ? g.parent.children : [];
    for (const k of kids) {
      const t = k._text ?? k.text;
      if (typeof t === 'string' && t.trim()) return t.trim();
    }
    return null;
  }

  function rootOf(g) {
    let r = g;
    while (r.parent) r = r.parent;
    return r;
  }

  // The root of the game on screen: the one holding your newest visible player circle.
  function currentRoot() {
    const name = myName();
    let root = null;
    for (const g of circles) {
      if (g.destroyed || !g.parent || !g.worldVisible) continue;
      if (name && nameOf(g) === name) root = rootOf(g); // later entries are newer
    }
    return root;
  }

  function myName() {
    if (CFG.myName) return CFG.myName.trim();
    const el = document.getElementById('pretty_top_name');
    const n = el && el.textContent.trim();
    return n || null;
  }

  let scaleCache = 1, scaleAt = -1e9;
  function canvasScale() {
    const t = performance.now();
    if (t - scaleAt < 1000) return scaleCache;
    scaleAt = t;
    scaleCache = canvasScaleNow();
    return scaleCache;
  }
  function canvasScaleNow() {
    const r = document.getElementById('gamerenderer');
    const c = r && r.querySelector('canvas');
    const w = c ? (parseFloat(c.style.width) || c.clientWidth) : 0;
    return w > 0 ? w / BONK_W : 1;
  }

  function sample(g, now, scale) {
    const p = g.getGlobalPosition();
    const x = p.x / scale, y = p.y / scale;
    let s = track.get(g);
    if (!s) { s = { x, y, vx: 0, vy: 0, t: now, moved: 0 }; track.set(g, s); return s; }
    const dt = (now - s.t) / 1000;
    // Same spot as last time and it's only been a moment: the game hasn't moved it yet (we
    // read faster than it updates). Wait for the real change so speeds are measured over
    // the real time it took.
    if (x === s.x && y === s.y && dt < 0.05) return s;
    if (dt > 0.003) {
      const a = 0.5; // smoothing
      s.vx = a * ((x - s.x) / dt) + (1 - a) * s.vx;
      s.vy = a * ((y - s.y) / dt) + (1 - a) * s.vy;
      s.moved += Math.hypot(x - s.x, y - s.y);
      s.x = x; s.y = y; s.t = now;
    }
    return s;
  }

  // Find the death ball: walk everything in the current game (skipping players and text)
  // and pick the ball-sized, roughly round object that has moved the most. This works no
  // matter how bonk draws the ball (circle, polygon or sprite).
  function objectSize(o, s, now, scale) {
    if (s.w === undefined || now - s.sizeAt > 1000) {
      try {
        const b = o.getBounds();
        s.w = b.width / scale; s.h = b.height / scale;
      } catch (e) { s.w = s.h = 0; }
      s.sizeAt = now;
    }
    return s;
  }

  function isBallShaped(s) {
    if (!(s.w >= CFG.ballMinSize && s.w <= CFG.ballMaxSize)) return false;
    if (!(s.h >= CFG.ballMinSize && s.h <= CFG.ballMaxSize)) return false;
    const ratio = s.w / s.h;
    return ratio > 0.6 && ratio < 1.6;
  }

  // Walking the whole scene and reading every object's position is the slow part, so it's
  // only done a few times a second; in between, only the ball itself is read.
  let ballObj = null, ballScanAt = -1e9;
  function findBall(root, now, scale, skip) {
    if (!root) return null;
    if (ballObj && now - ballScanAt < CFG.ballRescanMs && !ballObj.destroyed && ballObj.parent && ballObj.worldVisible) {
      try {
        const s = sample(ballObj, now, scale);
        s.resting = s.moved <= CFG.ballMinMoved;
        return s;
      } catch (e) { ballObj = null; }
    }
    ballScanAt = now;
    const found = findBallFull(root, now, scale, skip);
    ballObj = found ? found.__obj : null;
    return found;
  }
  function findBallFull(root, now, scale, skip) {
    let ball = null, best = CFG.ballMinMoved, resting = null;
    const stack = [root];
    while (stack.length) {
      const o = stack.pop();
      if (!o || !o.worldVisible || skip.has(o)) continue;
      if (typeof (o._text ?? o.text) === 'string') continue; // text labels
      if (o.children && o.children.length) {
        for (const c of o.children) stack.push(c);
        continue;
      }
      let s;
      try { s = sample(o, now, scale); } catch (e) { continue; }
      if (s.moved <= best) {
        // Not moved yet: could be the ball waiting for kickoff. Remember the ball-sized,
        // round object resting nearest the middle (preferring one drawn as a circle).
        if (!ball && Math.abs(s.x - CFG.midX) < CFG.kickoffZone && isBallShaped(objectSize(o, s, now, scale))) {
          const d = Math.abs(s.x - CFG.midX) - (circles.has(o) ? 1000 : 0);
          if (!resting || d < resting.d) { resting = { s, d }; s.__obj = o; }
        }
        continue;
      }
      if (!isBallShaped(objectSize(o, s, now, scale))) continue;
      best = s.moved; ball = s; s.__obj = o;
    }
    if (!ball && resting) { resting.s.resting = true; return resting.s; }
    if (ball) ball.resting = false;
    return ball;
  }

  // ---------------- MAP AWARENESS ----------------
  // The map as the bot understands it: every solid piece bonk draws (rectangles, ramps and
  // other polygons, circles), in map units, with its exact outline. Solid = it doesn't move,
  // isn't a player or the ball, and doesn't contain a player (a piece players are inside
  // is background). Rebuilt once a second. Used for: the grapple radar (exact distance to
  // every surface), where the ground is under us (ramps too), and predicting the ball's
  // flight with bounces off every surface (bounciness learned from real bounces).
  let mapModel = [];
  let mapModelAt = 0;
  let mapFromGeometry = false;
  function toWorld(g, x, y, scale) {
    const m = g.worldTransform || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    return [(m.a * x + m.c * y + m.tx) / scale, (m.b * x + m.d * y + m.ty) / scale];
  }
  function shapeBox(sh) {
    if (sh.type === 'circle') return { x0: sh.x - sh.r, y0: sh.y - sh.r, x1: sh.x + sh.r, y1: sh.y + sh.r };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of sh.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  function buildMap(root, now, scale, skip, players) {
    if (!root || now - mapModelAt < 1000) return mapModel;
    mapModelAt = now;
    const out = [];
    const stack = [root];
    while (stack.length) {
      const o = stack.pop();
      if (!o || !o.worldVisible || skip.has(o)) continue;
      if (typeof (o._text ?? o.text) === 'string') continue;
      if (o.children && o.children.length) for (const c of o.children) stack.push(c);
      if (!o.__wdbGeo || !o.__wdbGeo.length) continue;
      const t = track.get(o);
      if (t && t.moved > CFG.ballMinMoved) continue; // moving: the ball or a player, not the map
      for (const gm of o.__wdbGeo) {
        let sh;
        if (gm.type === 'circle') {
          const [cx, cy] = toWorld(o, gm.x, gm.y, scale);
          const [ex] = toWorld(o, gm.x + gm.r, gm.y, scale);
          sh = { type: 'circle', x: cx, y: cy, r: Math.abs(ex - cx) || gm.r / scale };
        } else {
          let local;
          if (gm.type === 'rect') local = [[gm.x, gm.y], [gm.x + gm.w, gm.y], [gm.x + gm.w, gm.y + gm.h], [gm.x, gm.y + gm.h]];
          else if (gm.type === 'ellipse') {
            local = [];
            for (let i = 0; i < 12; i++) local.push([gm.x + gm.rx * Math.cos(i * Math.PI / 6), gm.y + gm.ry * Math.sin(i * Math.PI / 6)]);
          } else { local = []; for (let i = 0; i + 1 < gm.pts.length; i += 2) local.push([gm.pts[i], gm.pts[i + 1]]); }
          sh = { type: 'poly', pts: local.map(([x, y]) => toWorld(o, x, y, scale)) };
        }
        sh.box = shapeBox(sh);
        const w = sh.box.x1 - sh.box.x0, h = sh.box.y1 - sh.box.y0;
        if (!(w >= 1 || h >= 1)) continue;
        if (w > BONK_W * 0.8 && h > 400) continue;                          // the background
        if (players.some((p) => shapeDist(sh, p.x, p.y).d < 0)) continue;  // players are inside it: not solid
        out.push(sh);
      }
    }
    mapFromGeometry = out.length > 0;
    mapModel = out;
    return out;
  }

  // ---- geometry ----
  function closestOnSeg(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L));
    return [ax + vx * t, ay + vy * t];
  }
  function inPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Distance from a point to a shape's surface (negative inside), the closest surface point,
  // and the surface normal pointing out toward the point.
  function shapeDist(sh, px, py) {
    if (sh.type === 'circle') {
      const dx = px - sh.x, dy = py - sh.y, L = Math.hypot(dx, dy) || 1e-6;
      return { d: L - sh.r, x: sh.x + (dx / L) * sh.r, y: sh.y + (dy / L) * sh.r, nx: dx / L, ny: dy / L };
    }
    let best = null;
    const pts = sh.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [cx, cy] = closestOnSeg(px, py, pts[j][0], pts[j][1], pts[i][0], pts[i][1]);
      const d = Math.hypot(px - cx, py - cy);
      if (!best || d < best.d) best = { d, x: cx, y: cy };
    }
    const inside = inPoly(px, py, pts);
    const L = best.d || 1e-6;
    let nx = (px - best.x) / L, ny = (py - best.y) / L;
    if (inside) { nx = -nx; ny = -ny; }
    return { d: inside ? -best.d : best.d, x: best.x, y: best.y, nx, ny };
  }
  // The map's solid pieces, with the old box scan (and plain floor/walls) as a fallback.
  function solidShapes(s) {
    if (s.map && s.map.length) return s.map;
    const out = (s.shapes || []).map((q) => {
      const sh = { type: 'poly', pts: [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]] };
      sh.box = q;
      return sh;
    });
    return out;
  }
  // Where the ground is under x (the resting height of a player's centre there): the first
  // surface straight below, from the map; else the learned flat floor.
  function groundAt(s, x, fromY) {
    let best = null;
    for (const sh of solidShapes(s)) {
      const b = sh.box;
      if (x < b.x0 || x > b.x1 || b.y1 < fromY - CFG.playerRadius) continue;
      // march down to find the top surface under x
      for (let y = Math.max(fromY - CFG.playerRadius, b.y0 - 1); y <= b.y1 + 1; y += 2) {
        if (shapeDist(sh, x, y).d <= 0) { if (best == null || y < best) best = y; break; }
      }
    }
    if (best != null) return best - CFG.playerRadius;
    return s.floorY;
  }

  // We can't cross the barrier (or leave the field): keep predictions on our half.
  function halfClamp(s, x) {
    const r = CFG.playerRadius;
    const lo = s.side === 'left' ? s.bounds.minX + r : s.midX + r;
    const hi = s.side === 'left' ? s.midX - r : s.bounds.maxX - r;
    return Math.max(lo, Math.min(hi, x));
  }
  // ---- our own movement is stopped by the map ----
  // Walk from x=from toward x=to at height y and stop at the first solid wall-like surface
  // (the barrier, a wall, the side of a block). Floors and ramps don't stop us sideways.
  function blockedX(s, from, to, y) {
    const shapes = solidShapes(s);
    const dir = Math.sign(to - from);
    if (!shapes.length || !dir) return to;
    const r = CFG.playerRadius;
    const hits = (px) => shapes.some((sh) => {
      const b = sh.box;
      if (px < b.x0 - r || px > b.x1 + r || y < b.y0 - r || y > b.y1 + r) return false;
      const c = shapeDist(sh, px, y);
      return c.d < r - 2 && Math.abs(c.nx) > 0.7; // a wall-like face right against us
    });
    let x = from;
    for (let i = 0; i < 400; i++) {
      const nx = x + dir * 3;
      if ((dir > 0 && nx >= to) || (dir < 0 && nx <= to)) return hits(to) ? x : to;
      if (hits(nx)) return x;
      x = nx;
    }
    return x;
  }

  // ---- The field: our net, the back wall above it, the ceiling, the barrier, and the ramps.
  //      WDB: each side wall is grey back wall at the top with an OPEN gap at the bottom -
  //      that gap is the net, the space to protect. Found from the map's real shapes (the
  //      biggest gap in the side wall near the floor); if the map isn't seen, the standard
  //      WDB layout is assumed. Stored as the LEFT side and mirrored for the right.
  let fieldCache = { at: -1, f: null };
  function field(s) {
    if (fieldCache.f && fieldCache.at === mapModelAt) return fieldCache.f;
    const floor = s.floorY ?? 463;
    const shapes = solidShapes(s);
    const solidAt = (x, y) => shapes.some((sh) => {
      const b = sh.box;
      return x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1 && shapeDist(sh, x, y).d <= 0;
    });
    // default (standard WDB): wall 22 thick, net from 143 above the floor down to 9 above it
    let net = { x: 22, y0: floor - 143, y1: floor - 9, found: false };
    if (shapes.length) {
      // the side wall column: runs of open space from the ceiling down to the floor
      const runs = [];
      let start = null;
      for (let y = 4; y <= floor + 8; y += 3) {
        const open = !solidAt(6, y);
        if (open && start == null) start = y;
        if ((!open || y + 3 > floor + 8) && start != null) { runs.push([start, y]); start = null; }
      }
      // the net: the longest open run reaching down near the floor, not the whole wall
      const cands = runs.filter(([a, b]) => b - a > 40 && b - a < floor - 30 && b > floor - 60);
      if (cands.length) {
        const [a, b] = cands.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p));
        // how thick the back wall is (where the wall above the net ends)
        let wx = 0;
        while (wx < 60 && solidAt(wx + 1, a - 15)) wx++;
        net = { x: wx > 2 ? wx : 22, y0: a, y1: Math.min(b, floor), found: true };
      }
    }
    // ramps on our (left) half: where the ground rises above the floor
    const ramps = [];
    let r0 = null;
    for (let x = 2; x <= CFG.midX; x += 4) {
      const g = shapes.length ? groundAt(s, x, 0) : floor;
      const up = g != null && g < floor - 2;
      if (up && r0 == null) r0 = x;
      if ((!up || x + 4 > CFG.midX) && r0 != null) { ramps.push([r0, x]); r0 = null; }
    }
    const backRamp = ramps.find(([a]) => a < 60) || [0, 42];
    const centerRamp = ramps.find(([, b]) => b > CFG.midX - 20) || [316, CFG.midX];
    const f = { net, backRamp, centerRamp, ceiling: s.bounds ? s.bounds.minY : 0 };
    fieldCache = { at: mapModelAt, f };
    return f;
  }
  // Is (x, y) in a net? whose = 'ours' or 'theirs'.
  function inNet(s, x, y, whose) {
    const f = field(s), r = s.ballR || 10;
    const left = (whose === 'ours') === (s.side === 'left');
    const past = left ? x <= f.net.x + r : x >= BONK_W - f.net.x - r; // the ball reaching into the opening
    return past && y >= f.net.y0 - r * 0.5 && y <= f.net.y1 + r;
  }
  function netCenter(s, whose) {
    const f = field(s);
    const left = (whose === 'ours') === (s.side === 'left');
    return { x: left ? f.net.x : BONK_W - f.net.x, y: (f.net.y0 + f.net.y1) / 2 };
  }
  // Following a flight path: does (and when does) it go into a net?
  function pathInNet(s, path, whose) {
    for (const q of path) if (inNet(s, q.x, q.y, whose)) return q;
    return null;
  }

  // ---- the ball's flight, with bounces off every surface ----
  // Simulated once per tick (1/60 s steps) and shared by every prediction in the bot.
  let flightCache = { ball: null, path: null };
  function ballFlight(s) {
    const ball = s.ball;
    if (flightCache.ball === ball && flightCache.path) return flightCache.path;
    const path = simFlight(s, ball, CFG.flightHorizon, 1 / 60);
    flightCache = { ball, path };
    return path;
  }
  // The flight of any ball state (a real one, or "what if it were released like this").
  function simFlight(s, ball, T, dt) {
    const R = s.ballR || 10, e = brain.map.bounce, fr = brain.map.slide;
    const floorLine = (s.floorY ?? s.bounds.maxY - 40) + CFG.playerRadius; // the floor surface
    const shapes = solidShapes(s);
    let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    const path = [{ t: 0, x, y, vx, vy }];
    for (let t = dt; t <= T + 1e-9; t += dt) {
      vy += curG * dt; x += vx * dt; y += vy * dt;
      const hit = (nx, ny, push) => {
        x += nx * push; y += ny * push;
        const vn = vx * nx + vy * ny;
        if (vn < 0) { vx -= (1 + e) * vn * nx; vy -= (1 + e) * vn * ny; vx *= 1 - fr * Math.abs(ny); }
      };
      for (const sh of shapes) {
        const b = sh.box;
        if (x < b.x0 - R || x > b.x1 + R || y < b.y0 - R || y > b.y1 + R) continue;
        const c = shapeDist(sh, x, y);
        if (c.d < R) hit(c.nx, c.ny, R - c.d);
      }
      if (!mapFromGeometry) { // no exact map: at least the floor and side walls
        if (y > floorLine - R) hit(0, -1, y - (floorLine - R));
        if (x < s.bounds.minX + R) hit(1, 0, s.bounds.minX + R - x);
        if (x > s.bounds.maxX - R) hit(-1, 0, x - (s.bounds.maxX - R));
      }
      path.push({ t, x, y, vx, vy });
    }
    return path;
  }
  // Where the ball will be after t seconds (from the shared bounce-aware flight).
  function ballPos(s, t) {
    const path = ballFlight(s);
    const i = Math.min(path.length - 1, Math.max(0, Math.round(t * 60)));
    if (t <= path[path.length - 1].t + 1e-9) return path[i];
    const p = path[path.length - 1], dt = t - p.t; // beyond the simulated window: plain flight
    return { t, x: p.x + p.vx * dt, y: p.y + p.vy * dt + 0.5 * curG * dt * dt, vx: p.vx, vy: p.vy + curG * dt };
  }

  // ---- learning how bouncy the ball is, from real bounces ----
  let prevBallObs = null;
  let ballRestY = null;
  function learnBounces(s) {
    const b = s.ball;
    if (!b) { prevBallObs = null; return; }
    if (prevBallObs) {
      const dvx = b.vx - prevBallObs.vx, dvy = b.vy - prevBallObs.vy;
      if (Math.hypot(dvx, dvy) > CFG.bounceDetect) { // a sudden change: did it hit something?
        let near = null;
        for (const sh of solidShapes(s)) {
          const c = shapeDist(sh, b.x, b.y);
          if (c.d < (s.ballR || 10) + 8 && (!near || c.d < near.d)) near = c;
        }
        if (near) {
          const vin = prevBallObs.vx * near.nx + prevBallObs.vy * near.ny;
          const vout = b.vx * near.nx + b.vy * near.ny;
          if (vin < -60 && vout > 0) {
            const e = Math.min(1.2, vout / -vin);
            brain.map.bounce += 0.2 * (e - brain.map.bounce);
            brain.map.bounces++;
            saveBrain();
          }
        }
      }
      // The floor itself (works without map shapes too): how much a bounce off it keeps, and how
      // fast a rolling ball slows down - so predictions of where a shot or a throw ends up are right.
      const now = performance.now(), dt = (now - prevBallObs.t) / 1000;
      // where the ball sits when it's on the floor (the lowest it's been seen moving flat)
      if (Math.abs(b.vy) < 25 && b.y > (s.floorY ?? s.bounds.maxY) - 40) ballRestY = ballRestY == null ? b.y : Math.max(ballRestY, b.y);
      const onFloorB = ballRestY != null && b.y >= ballRestY - 5;
      if (dt > 0.005 && dt < 0.2 && onFloorB) {
        if (prevBallObs.vy > 80 && b.vy < 0 && !solidShapes(s).length) { // a bounce off the floor
          const e = Math.min(1.2, -b.vy / prevBallObs.vy);
          brain.map.bounce += 0.1 * (e - brain.map.bounce); brain.map.bounces++;
        }
        if (Math.abs(b.vy) < 40 && Math.abs(prevBallObs.vy) < 40 && Math.abs(prevBallObs.vx) > 30 &&
            Math.sign(b.vx) === Math.sign(prevBallObs.vx)) { // rolling: friction
          const r = Math.abs(b.vx) / Math.abs(prevBallObs.vx);
          if (r > 0.2 && r <= 1.0) {
            const fr = 1 - Math.pow(r, 1 / (60 * dt)); // per 1/60 s step, as the flight model uses it
            brain.map.slide += 0.05 * (Math.max(0, Math.min(0.3, fr)) - brain.map.slide);
            brain.map.slides = (brain.map.slides || 0) + 1;
          }
        }
      }
    }
    prevBallObs = { vx: b.vx, vy: b.vy, t: performance.now() };
  }

  // Map shapes (floor, walls, barrier, ramps) for the grapple radar: everything in the
  // current game that isn't a player, text or moving. Re-scanned once a second.
  let mapShapes = [];
  let mapScanAt = 0;
  function scanMap(root, now, scale, skip) {
    if (!root || now - mapScanAt < 1000) return mapShapes;
    mapScanAt = now;
    const out = [];
    const stack = [root];
    while (stack.length) {
      const o = stack.pop();
      if (!o || !o.worldVisible || skip.has(o)) continue;
      if (typeof (o._text ?? o.text) === 'string') continue;
      if (o.children && o.children.length) { for (const c of o.children) stack.push(c); continue; }
      const t = track.get(o);
      if (t && t.moved > CFG.ballMinMoved) continue; // moving things aren't part of the map
      let b;
      try { b = o.getBounds(); } catch (e) { continue; }
      const q = { x0: b.x / scale, y0: b.y / scale, x1: (b.x + b.width) / scale, y1: (b.y + b.height) / scale };
      const w = q.x1 - q.x0, h = q.y1 - q.y0;
      if (!(w >= 1 || h >= 1)) continue;
      if (w > BONK_W * 0.8 && h > 400) continue; // the background
      out.push(q);
    }
    mapShapes = out;
    return out;
  }

  function readState() {
    if (stateProvider) {
      try { return stateProvider(); } catch (e) { waitReason = 'provider error'; return null; }
    }
    const name = myName();
    if (!name) { waitReason = "can't find you (set WDB.CFG.myName)"; return null; }

    const now = performance.now();
    const scale = canvasScale();
    let me = null, ball = null;
    const others = new Map(); // name -> tracked position of every other living player

    // Only look at the game currently on screen: leftovers from earlier games live under
    // a different root, so find the root of *your* player first.
    let myRoot = currentRoot();
    if (myRoot) lastRoot = myRoot;
    else if (lastRoot && !lastRoot.destroyed) myRoot = lastRoot; // dead: keep watching that game

    const playerBoxes = new Set(); // player containers, skipped when looking for the ball
    for (const g of circles) {
      if (g.destroyed || !g.parent) { circles.delete(g); continue; }
      if (!g.worldVisible) continue;
      if (myRoot && rootOf(g) !== myRoot) continue;
      const n = nameOf(g);
      if (!n) continue;
      playerBoxes.add(g.parent);
      const s = sample(g, now, scale);
      if (n === name) me = s; else others.set(n, s);
    }
    ball = findBall(myRoot, now, scale, playerBoxes);
    const shapes = scanMap(myRoot, now, scale, playerBoxes);
    const map = buildMap(myRoot, now, scale, playerBoxes,
                         [...(me ? [me] : []), ...[...others.values()]].map((p) => ({ x: p.x, y: p.y })));

    if (!me) {
      // Dead (or waiting to respawn): keep watching the game from our last side and learn
      // from everyone's offense and defence.
      if (myRoot && (others.size || ball)) {
        waitReason = 'dead: watching and learning';
        const side = lastSide;
        const players = [...others].map(([n, p]) => ({
          name: n, x: p.x, y: p.y, vx: p.vx, vy: p.vy, side: p.x < CFG.midX ? 'left' : 'right',
        }));
        const floorNow = CFG.floorY ?? learnedFloorY ?? 460;
        const ourGoal = CFG.goal ? (CFG.goal.side === side ? CFG.goal : { x: BONK_W - CFG.goal.x, y: CFG.goal.y }) : null;
        return {
          spectating: true, me: null,
          ball: ball ? { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy } : null,
          ballR: ball && ball.w ? ball.w / 2 : 10, shapes, map, players,
          enemies: players.filter((p) => p.side !== side), side, midX: CFG.midX,
          floorY: CFG.floorY ?? learnedFloorY,
          enemyGoal: ourGoal ? { x: BONK_W - ourGoal.x, y: ourGoal.y } : { x: side === 'left' ? BONK_W - 40 : 40, y: floorNow - 20 },
          ballInfo: null, gravity: CFG.gravity ?? Math.max(0, gravityEst),
          bounds: { minX: 0, maxX: BONK_W, minY: 0, maxY: 500 },
        };
      }
      waitReason = `can't find you ("${name}") - dead or not in a round`;
      return null;
    }

    // Learn where the floor is: the lowest spot where you've come to rest.
    if (Math.abs(me.vy) < 20) {
      learnedFloorY = learnedFloorY == null ? me.y : Math.max(learnedFloorY, me.y);
    }

    // No ball yet (e.g. before the round starts) is fine: the bot just gets into position.
    const side = me.x < CFG.midX ? 'left' : 'right';
    lastSide = side;
    const players = [...others].map(([n, p]) => ({
      name: n, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      side: p.x < CFG.midX ? 'left' : 'right',
    }));
    const enemies = players.filter((p) => p.side !== side);

    // Throw target: their net. It's the mirror image of our goal (WDB.markGoal());
    // until that's set, aim low at the far back of their half.
    const floorNow = CFG.floorY ?? learnedFloorY ?? 460;
    const ourGoal = CFG.goal
      ? (CFG.goal.side === side ? CFG.goal : { x: BONK_W - CFG.goal.x, y: CFG.goal.y })
      : null;
    const aim = ourGoal
      ? { x: BONK_W - ourGoal.x, y: ourGoal.y }
      : { x: side === 'left' ? BONK_W - 40 : 40, y: floorNow - 20 };

    // Ball flight: gravity is measured from how the ball's vertical speed changes.
    let ballInfo = null;
    if (ball) {
      if (ball.pt !== undefined && now - ball.pt > 10) {
        const ay = (ball.vy - ball.pvy) / ((now - ball.pt) / 1000);
        const speed = hyp(ball.vx, ball.vy);
        if (Math.abs(ay) < 3000 && speed > 30) gravityEst += 0.05 * (ay - gravityEst);
      }
      ball.pvy = ball.vy; ball.pt = now;
      const back = side === 'left' ? -1 : 1; // direction of our net
      ballInfo = {
        height: floorNow - ball.y,                          // above the floor
        speed: hyp(ball.vx, ball.vy),
        angle: (Math.atan2(-ball.vy, ball.vx) * 180) / Math.PI, // 0 = right, 90 = up
        towardOurNet: ball.vx * back > CFG.backwardsSpeed,
        rising: ball.vy < -20,
      };
    }

    return {
      me: { x: me.x, y: me.y, vx: me.vx, vy: me.vy, alive: true },
      ball: ball ? { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy } : null,
      kickoff: !!(ball && ball.resting),   // the ball is sitting still in the middle: kickoff
      ballR: ball && ball.w ? ball.w / 2 : 10,
      shapes,
      map,
      players,
      enemies,
      side,
      midX: CFG.midX,
      floorY: CFG.floorY ?? learnedFloorY,
      enemyGoal: aim,        // where throws are aimed: their net
      ballInfo,
      gravity: CFG.gravity ?? Math.max(0, gravityEst),
      bounds: { minX: 0, maxX: BONK_W, minY: 0, maxY: 500 },
    };
  }

  // ---------------- INPUT ----------------
  const held = new Set();

  function sendKey(name, down) {
    const k = botKey(name);
    if (!k) return; // that control has no key yet (set them with F6)
    const target = document.getElementById('gamerenderer') || document;
    const ev = document.createEvent('HTMLEvents');
    ev.initEvent(down ? 'keydown' : 'keyup', true, false);
    ev.keyCode = k.keyCode; ev.which = k.keyCode; ev.key = k.key; ev.code = k.code;
    target.dispatchEvent(ev);
  }

  let lastRefresh = 0;
  function setKeys(wanted) {
    for (const name of Object.keys(KEYS)) {
      const want = wanted.has(name);
      if (want && !held.has(name)) { sendKey(name, true); held.add(name); }
      if (!want && held.has(name)) { sendKey(name, false); held.delete(name); }
    }
  }

  // bonk can drop keys that were pressed at the wrong moment (e.g. during the countdown),
  // so held keys are pressed again every keyRefreshMs, like a keyboard's auto-repeat.
  function refreshKeys(now, every = CFG.keyRefreshMs) {
    if (now - lastRefresh < every) return;
    lastRefresh = now;
    for (const name of held) sendKey(name, true);
  }

  const releaseAll = () => setKeys(new Set());

  // ---------------- MATH ----------------
  const hyp = (x, y) => Math.hypot(x, y);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  let curS = null; // this tick's state (so helpers can use the shared ball flight)
  // Closest the ball will come to `me` within the lookahead window.
  function predictClosest(me, ball) {
    let best = { d: Infinity, t: 0, x: ball.x, y: ball.y };
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = (CFG.lookahead * i) / steps;
      const bp = curS && ball === curS.ball ? ballPos(curS, t)
                 : { x: ball.x + ball.vx * t, y: ball.y + ball.vy * t + 0.5 * curG * t * t };
      const bx = bp.x, by = bp.y;
      const mx = me.x + me.vx * t;
      const my = me.y + me.vy * t;
      const d = hyp(bx - mx, by - my);
      if (d < best.d) best = { d, t, x: bx, y: by };
    }
    return best;
  }

  // Near the barrier (e.g. the ball sitting on the center spike) counts as neither side.
  // Would letting go of the ball right now be safe? Follows its free flight (no rope):
  // it mustn't pass through our goal or us, and if awayRequired it must be heading to
  // their side.
  function releaseOk(s, awayRequired) {
    const { me, ball } = s;
    if (!ball) return true;
    if (awayRequired && ball.vx * fwdSign(s.side) < CFG.saveAwaySpeed) return false;
    const goal = goalFor(s);
    const floor = s.floorY ?? s.bounds.maxY;
    const touch = CFG.playerRadius + (s.ballR || 10) + CFG.killMargin;
    // We keep moving after we let go (and brake), so check the ball against where we'll be.
    const push = me.y >= floor - CFG.floorNear ? brain.move.groundAx : brain.move.airAx;
    let vx = me.vx, mx = me.x;
    const dt = CFG.pathLookahead / 30;
    for (let i = 0; i <= 30; i++) {
      const t = i * dt;
      if (i > 0) {
        vx = Math.sign(vx) * Math.max(0, Math.abs(vx) - push * dt);
        mx = halfClamp(s, mx + vx * dt);
      }
      const my = Math.min(floor, me.y + me.vy * t + 0.5 * brain.move.g * t * t);
      const bp = ballPos(s, t), bx = bp.x, by = bp.y;
      if (inNet(s, bx, by, 'ours') || (CFG.goal && goal && hyp(bx - goal.x, by - goal.y) < CFG.goalRadius)) return false;
      if (hyp(bx - mx, by - my) < touch) return false;
      if (i > 3 && by >= floor && Math.abs(ball.vx) < 20) break; // it's come to rest
    }
    return true;
  }

  // Grabbing is only unsafe if the ball would actually touch us before the rope takes it.
  // Safe to grab if the ball stays clear of us for a short window after grabbing (the rope
  // may not stop it instantly, or may go slack), following its flight and our own motion
  // (including gravity while we're in the air).
  const grabClear = (s, t0 = 0, me0 = null) => {
    const me = me0 || s.me, ball = s.ball, floor = s.floorY ?? s.bounds.maxY;
    const inAir = me.y < floor - CFG.floorNear;
    if (ballStill(s)) { // a still ball: once the rope's on it, it holds us off it
      const bp = ballPos(s, t0);
      return hyp(bp.x - me.x, bp.y - me.y) - CFG.playerRadius - (s.ballR || 10) - 2;
    }
    let min = Infinity;
    for (let i = 0; i <= 8; i++) {
      const t = (CFG.grabSafeWindow * i) / 8, tt = t0 + t;
      const mx = me.x + me.vx * t, my = Math.min(floor, me.y + me.vy * t + (inAir ? 0.5 * brain.move.g * t * t : 0));
      const bp = ballPos(s, tt), bx = bp.x, by = bp.y;
      min = Math.min(min, hyp(bx - mx, by - my));
    }
    return min - CFG.playerRadius - (s.ballR || 10);
  };
  const safeToGrab = (s) => grabClear(s) >= CFG.grabSafety;
  // How close we may get: the kickoff ball sitting still on the spike can't come at us, so we
  // can get right up to it to grab it; anything else gets the full margin.
  const ballStill = (s) => !!s.ball && !!s.kickoff && hyp(s.ball.vx, s.ball.vy) < CFG.stillSpeed; // the kickoff ball
  const killM = (s) => (ballStill(s) ? CFG.stillKillMargin : CFG.killMargin);

  const onOurSide = (s, x) => (s.side === 'left' ? x < s.midX - CFG.centerMargin : x > s.midX + CFG.centerMargin);

  // ---------------- BRAIN ----------------
  let mode = 'IDLE';
  let modeSince = 0;
  let jump = null;          // the jump in progress: { type, dir, grab, label, boostMs, up, heavy }
  let lastJumpEnd = 0;
  let positioned = false;   // in the middle of our side; left/right locked while the ball is away
  let positionStart = 0;
  let throwTarget = 'net';
  let replay = null;        // an opponent's shot being replayed: { m, i, endAt }
  let lastReleaseAt = 0;
  let lastReleaseTarget = 'net';
  let throwAt = null;        // this throw's target: { kind: 'net' } or { kind: 'player', name }
  let throwJitter = 0;
  let kickoffThrow = false;  // this grab came from a kickoff: any safe throw onto their side wins it       // a small random aim offset when being unpredictable
  let lastTargetFailed = null;
  let grabInfo = { at: 0, save: false }; // when we caught the ball, and whether it was a save
  let regrabUntil = 0;                   // offense: go straight back for the ball until then
  let regrabCounted = false;
  let grabCheck = { at: 0, dist: 0 }; // checking the rope actually caught the ball    // when we last let go of the ball (so we don't grab our own throw)  // 'net' = their net, 'backwall' = our back wall (set-up play)
  let decision = '';        // why the bot is doing what it's doing (shown on the panel)
  let lastLesson = '';      // the last thing it learned (shown on the panel)
  let curG = 0;             // gravity used for predictions this tick
  let lastRadar = [];
  const setMode = (m) => { if (m !== mode) { mode = m; modeSince = performance.now(); } };

  // ---- Jump types. Every jump starts by grappling the ground (Z); bigger ones add Up
  //      and X. Their real heights are measured and learned (brain.apex).
  const JUMP_TYPES = {
    low:     { boostMs: () => CFG.lowJumpMs,     up: false, heavy: false },
    regular: { boostMs: () => CFG.jumpGrappleMs, up: false, heavy: false },
    high:    { boostMs: () => CFG.highJumpMs,    up: true,  heavy: false },
    super:   { boostMs: () => CFG.superJumpMs,   up: true,  heavy: true },
  };
  const JUMP_ORDER = ['low', 'regular', 'high', 'super'];

  // ---- Learning. Two things are learned, both saved in the browser between sessions:
  //  apex/lift/air: how high each jump type really goes, how long it takes to leave the
  //          ground, and how long it stays up (all measured on every jump)
  //  scores: for each kind of shot (ball height x angle), how well each jump type worked
  //          (+1 grabbed the ball, +0.6 ball went back over, -0.2 missed, -1 died/goal)
  const BRAIN_KEY = 'wdbBotBrain';
  const freshBrain = () => ({
    apex: { low: 30, regular: 55, high: 95, super: 140 },    // how high each jump goes
    lift: { low: 60, regular: 120, high: 200, super: 200 },  // ms from pressing Z to leaving the ground
    air:  { low: 400, regular: 550, high: 750, super: 900 },  // ms from leaving the ground to landing
    scores: {}, jumps: 0,
    // How hard our own keys push us (units/s^2), learned from our own movement. Used to
    // read the opponent's inputs from how they accelerate.
    move: { groundAx: 500, airAx: 300, g: 600, upAy: 150, downAy: 150, heavyAy: 350 },
    superSide: { v: 0, n: 0 }, // holding left/right while pressing X+Z: how much sideways speed the super jump gets
    moves: [],                // recorded opponent shots (inferred inputs), replayed when we throw
    pickups: {},              // offense: "height|distance|jump" -> how well that regrab approach works
    review: { goodSaves: 0, badSaves: 0, wallSaves: 0, goodShots: 0, badShots: 0, goodKickoffs: 0, badKickoffs: 0, tooSlow: 0 }, // its own verdicts
    defMoves: [],             // watched saves (inputs from the moment the ball came at them)
    kickMoves: [],            // watched kickoffs that were won
    kickoffPlans: {},         // our own kickoff approaches -> how they went
    copyStats: { tries: 0, grabs: 0 },
    skill: {},                // player name -> { g, b }: how often what they do works (who to copy)
    holds: {},                // grapple hold length (250 ms steps) -> { g, b }: throws that got over or not
    posLearn: { d: null, n: 0 }, // where the good players wait (distance from the barrier)
    passes: {},               // pass spot (front / behind / above / below) -> { g, b }, ours and watched
    // what grapple moves in the air actually do (measured): a tap for height, a super jump
    // from the air, and how fast we drift while ballooning (negative = rising)
    airMoves: { boost: { h: 0, n: 0 }, super: { h: 0, n: 0 }, balloonVy: { v: 100, n: 0 } },
    shotMem: {},              // "kind|angle|speed" of an incoming shot -> save plans and how they went
    knn: [],                  // situation -> how a good player moved (state-matched copying)
    stances: {},              // where it waits for a throw -> how its saves went from there
    map: { bounce: 0.5, slide: 0.05, bounces: 0 }, // learned: how bouncy the ball is off surfaces
    targets: { net: { tries: 0, wins: 0 }, player: { tries: 0, wins: 0 } }, // aiming at the net vs a player
    vs: {},                   // opponent name -> recent shot results against them (1 good, 0 bad)
    pickupTries: 0,
    throwPower: 1,            // learned: multiplies the release speed (goes up when throws come back)
    regrab: { tries: 0, wins: 0 }, // offense regrabs: lost the ball / throw failed, then got it back
    plays: [],                                                // learned throws (see offense learning)
  });
  let brain = freshBrain();
  // Take a saved brain (from storage, or an imported file), filling in anything it lacks.
  function adoptBrain(saved) {
    if (!saved || !saved.apex) return false;
    const f = freshBrain();
    brain = Object.assign(f, saved);
    brain.lift = Object.assign(f.lift, saved.lift); // older saves didn't have these
    brain.air = Object.assign(freshBrain().air, saved.air);
    brain.move = Object.assign(freshBrain().move, saved.move);
    brain.superSide = Object.assign({ v: 0, n: 0 }, saved.superSide);
    brain.moves = saved.moves || [];
    brain.pickups = saved.pickups || {};
    brain.review = Object.assign(freshBrain().review, saved.review);
    brain.stances = saved.stances || {};
    brain.map = Object.assign(freshBrain().map, saved.map);
    brain.targets = Object.assign(freshBrain().targets, saved.targets);
    brain.vs = saved.vs || {};
    brain.pickupTries = saved.pickupTries || 0;
    brain.plays = Array.isArray(saved.plays) ? saved.plays : [];
    brain.defMoves = Array.isArray(saved.defMoves) ? saved.defMoves : [];
    brain.kickMoves = Array.isArray(saved.kickMoves) ? saved.kickMoves : [];
    brain.kickoffPlans = saved.kickoffPlans || {};
    brain.copyStats = Object.assign(freshBrain().copyStats, saved.copyStats);
    brain.skill = saved.skill || {};
    brain.holds = saved.holds || {};
    brain.posLearn = Object.assign({ d: null, n: 0 }, saved.posLearn);
    brain.passes = saved.passes || {};
    brain.airMoves = Object.assign(freshBrain().airMoves, saved.airMoves);
    brain.shotMem = saved.shotMem || {};
    brain.knn = Array.isArray(saved.knn) ? saved.knn : [];
    try { sanitizeJumps(); } catch (e) { /* not ready yet */ }
    return true;
  }
  try {
    adoptBrain(JSON.parse(localStorage.getItem(BRAIN_KEY)));
  } catch (e) { /* no saved brain */ }
  // Saving turns the whole brain into text, which takes a moment, so it's done rarely (at most
  // every CFG.saveEveryMs), when the browser is idle, and when you leave the page.
  let saveTimer = null, lastSaveAt = -1e9;
  function saveNow() {
    saveTimer = null; lastSaveAt = performance.now();
    try { if (typeof ML !== 'undefined' && ML.Q) mlSave(); } catch (e) { /* not ready */ }
    try { localStorage.setItem(BRAIN_KEY, JSON.stringify(brain)); } catch (e) { /* storage blocked */ }
  }
  function saveBrain() {
    if (saveTimer) return;
    const wait = Math.max(500, CFG.saveEveryMs - (performance.now() - lastSaveAt));
    saveTimer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(saveNow, { timeout: 3000 });
      else saveNow();
    }, wait);
  }
  try {
    window.addEventListener('pagehide', () => saveNow());
    if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  } catch (e) { /* ignore */ }

  let jumpTrack = null;  // measuring the current jump's height
  let pending = null;    // a jump waiting to find out whether it worked

  function bucketFor(needH, ball) {
    const h = needH < 30 ? 'ground' : needH < 70 ? 'low' : needH < 120 ? 'mid' : 'high';
    const a = ball.vy > 150 ? 'dropping' : ball.vy < -150 ? 'rising' : 'flat';
    return `${h}/${a}`;
  }

  // Would this jump carry us into the ball? Our jump is traced as an arc using the learned
  // lift-off delay, height and air time, and checked against the ball's predicted path.
  function jumpHitsBall(s, type, dir) {
    // Worst case: check with the sideways drift and without it (a jump may drift less).
    return jumpPathHits(s, type, dir) || (dir ? jumpPathHits(s, type, null) : false);
  }
  function jumpPathHits(s, type, dir) {
    return jumpClearance(s, type, dir) < CFG.jumpSafety;
  }
  // The smallest gap between us and the ball (surface to surface) along a jump.
  // wait = seconds we stand still before pressing the jump.
  function jumpClearance(s, type, dir, wait = 0) {
    const { me, ball } = s;
    if (!ball) return Infinity;
    const h = brain.apex[type], lift = brain.lift[type] / 1000, air = brain.air[type] / 1000;
    // Keep checking after we land: landing just in front of the ball is as deadly as
    // jumping into it.
    const T = Math.max(wait + lift + air, CFG.safetyHorizon) + CFG.afterLandingCheck;
    const touch = CFG.playerRadius + (s.ballR || 10);
    const floor = s.floorY ?? s.bounds.maxY;
    const sign = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const push = brain.move.groundAx;
    let min = Infinity, prevMx = me.x;
    const N = Math.max(20, Math.round(T * 50));
    for (let i = 0; i <= N; i++) {
      const t = (T * i) / N;
      const tj = t - wait;                                 // time since we pressed jump
      const u = Math.min(1, Math.max(0, (tj - lift) / air)); // 0 on the ground, 1 once landed
      const my = me.y - h * 4 * u * (1 - u);
      // our current sideways speed carries on, plus any drift from the jump; walls stop us
      // holding left/right while jumping speeds us up (learned push), up to top speed
      // sideways push once we're off the ground, until we land (an angled super jump holds the
      // direction from the moment it's pressed, so it's pushing during the lift-off too)
      const td = type === 'super' && dir ? Math.min(Math.max(0, tj), lift + air) : Math.min(Math.max(0, tj - lift), air);
      const tTop = CFG.maxRunSpeed / push;
      const driftX = sign * (td < tTop ? 0.5 * push * td * td : 0.5 * push * tTop * tTop + CFG.maxRunSpeed * (td - tTop)) +
                     (type === 'super' && sign ? sign * brain.superSide.v * td : 0); // an angled super jump
      const want = halfClamp(s, me.x + me.vx * t + driftX);
      const mx = blockedX(s, prevMx, want, my); // the barrier and walls stop us mid-air too
      prevMx = mx;
      const bp = ballPos(s, t), bx = bp.x, by = bp.y;
      min = Math.min(min, hyp(bx - mx, by - my) - touch);
    }
    return min;
  }

  // If we start this jump (straight up) after `wait` seconds, is there a moment where the
  // ball is the nearest thing within reach (closer than the ground by nearestMargin, and at
  // least grabMin away) with the ball never having come within killMargin before then?
  // Returns the time of that moment, or null.
  function grabWindow(s, type, wait) {
    const { me, ball } = s;
    if (!ball) return null;
    const h = brain.apex[type], lift = brain.lift[type] / 1000, air = brain.air[type] / 1000;
    const touch = CFG.playerRadius + (s.ballR || 10);
    const floor = s.floorY ?? s.bounds.maxY;
    const T = wait + lift + air, N = Math.max(24, Math.round(T * 60));
    for (let i = 0; i <= N; i++) {
      const t = (T * i) / N, tj = t - wait;
      const u = Math.min(1, Math.max(0, (tj - lift) / air));
      const my = me.y - h * 4 * u * (1 - u), mx = me.x + me.vx * t;
      const bp = ballPos(s, t), bx = bp.x, by = bp.y;
      const dist = hyp(bx - mx, by - my);
      if (dist - touch < killM(s)) return null;                 // too close before we could grab it
      const ballD = dist - (s.ballR || 10), groundD = floor - my;
      if (tj > lift + CFG.regrabGapMs / 1000 && dist >= CFG.grabMin && ballD <= CFG.grappleRange &&
          ballD <= groundD - CFG.nearestMargin) {
        // grabbable here - and (same rule as the real grab) the ball stays clear just after
        const vy = u > 0 && u < 1 ? -h * 4 * (1 - 2 * u) / air : 0;
        if (grabClear(s, t, { x: mx, y: my, vx: me.vx, vy }) >= CFG.grabSafety) return t;
      }
    }
    return null;
  }

  // ---- THE SAVE PLANNER (thinks in x / y over time). For an incoming shot it tries every
  //      jump (low / regular / high / super), straight up or drifting left / right, now or
  //      after waiting - standing still, or running first (moving under the ball with
  //      momentum) - and traces where we'd be (x, y) at each moment against where the ball
  //      will be (x, y). A plan is good if the ball never gets too close before the moment it
  //      becomes the nearest thing in grapple reach (so the grapple catches it), and that
  //      moment comes before it would reach our net. Earliest safe catch wins; jumps that
  //      got us killed on this kind of shot are skipped (a new approach next time).
  // Will the ball hit the floor before it reaches us, or reach us in the air?
  function bouncesFirst(s, tEnd) {
    const floor = (s.floorY ?? s.bounds.maxY) + CFG.playerRadius - (s.ballR || 10) - 4;
    let prev = null;
    for (const q of ballFlight(s)) {
      if (q.t > tEnd) break;
      if (prev && prev.vy > 30 && q.vy < 0 && q.y > floor - 15) return true;
      prev = q;
    }
    return false;
  }
  function shotKind(s, p) {
    const me = s.me, ball = s.ball, floor = s.floorY ?? s.bounds.maxY;
    if (p.hitMe) return bouncesFirst(s, p.hitMe.t) ? 'at-me-bounce' : 'at-me-air';
    if (floor - ball.y < 25) return 'rolling';
    if (p.closest.y < me.y - CFG.playerRadius && Math.abs(p.closest.x - me.x) < CFG.grappleRange) return 'over';
    return 'net';
  }
  // "The same shot again": incoming shots are remembered by kind, angle (15 degree steps,
  // mirrored to the left side) and speed (100 steps), with which save plans worked on them.
  function shotKey(s, kind) {
    const b = s.ball, vx = b.vx * fwdSign(s.side);
    const ang = Math.round((Math.atan2(-b.vy, -vx) * 180 / Math.PI) / 15) * 15;
    return `${kind}|${ang}|${Math.round(hyp(b.vx, b.vy) / 100) * 100}`;
  }
  const planSig = (pl) => `${pl.type}|${pl.dir || '-'}|${pl.style}|${pl.run || '-'}|${pl.wait > 0.15 ? 'late' : 'now'}`;
  function rememberShot(save, good) {
    if (!save || !save.key) return;
    const m = brain.shotMem[save.key] || (brain.shotMem[save.key] = {});
    const old = m[save.sig] ?? 0;
    m[save.sig] = old + CFG.learnRate * ((good ? 1 : -1) - old);
    const keys = Object.keys(brain.shotMem);
    if (keys.length > 300) delete brain.shotMem[keys[0]];
    saveBrain();
  }
  let planCache = { at: 0, plan: null };
  function planSave(s, now, p, fuelOk, opt = {}) {
    if (!opt.noCache && now - planCache.at < 50 && planCache.plan !== undefined && planCache.ball === s.ball) return planCache.plan;
    const me = s.me, floor = s.floorY ?? s.bounds.maxY;
    const touch = CFG.playerRadius + (s.ballR || 10), R = s.ballR || 10;
    const kind = shotKind(s, p);
    const key = shotKey(s, kind), mem = brain.shotMem[key] || {};
    const deadline = p.hitGoal ? p.hitGoal.t - 0.05 : Infinity;
    const gMe = Math.max(100, brain.move.g), am = brain.airMoves;
    const fuelMs = fuel;
    const lo = s.side === 'left' ? s.bounds.minX + CFG.playerRadius : s.midX + CFG.playerRadius;
    const hi = s.side === 'left' ? s.midX - CFG.playerRadius : s.bounds.maxX - CFG.playerRadius;
    const gA = brain.move.groundAx, aA = brain.move.airAx, vMax = CFG.maxRunSpeed;
    let best = null;
    const waits = [];
    for (let w = 0; w <= 0.6 + 1e-9; w += opt.light ? 0.1 : 0.05) waits.push(+w.toFixed(2));
    const am0 = brain.airMoves;
    const proven = (am0.boost.n >= 2 && am0.boost.h > 5) || (am0.balloonVy.n >= 2 && am0.balloonVy.v < 40) || (am0.super.n >= 2 && am0.super.h > 10);
    for (const airPass of [false, true]) {
    if (airPass && opt.light) break;
    if (airPass && best && !proven) break; // a plain jump does it and air moves aren't proven yet
    if (airPass && floorShot(s)) break;    // ball on the floor: plain low / regular jumps only
    for (const type of defJumps(s)) {
      if (!fuelOk(type)) continue;
      const h = brain.apex[type], lift = brain.lift[type] / 1000, air = brain.air[type] / 1000;
      const sc = (brain.scores['save:' + kind.replace(/-(bounce|air)$/, '')] || {})[type] ?? 0.2; // learned per broad kind
      // How we get height: the plain jump; a grapple tap at the top for more (not fully
      // committing); a balloon (hang at the top on the floor-grapple, holding up); or a super
      // jump out of the balloon. Air moves only count once they've been seen to work.
      // Air moves: used once measured to work, or tried when a plain jump can't make the save
      // (that's also how it finds out what they do in this game).
      const styles = ['plain'];
      if (type !== 'super' && airPass) {
        const works = (m, ok) => m.n >= 2 && ok;
        const tryIt = (m) => m.n < 2 && (m.tries || 0) < 3; // a few tries to find out, then only if it works
        if ((works(am.boost, am.boost.h > 5) || tryIt(am.boost)) && fuelMs > CFG.airBoostMs + 900) styles.push('boost');
        if ((works(am.balloonVy, am.balloonVy.v < 40) || tryIt(am.balloonVy)) && fuelMs > 1400) styles.push('balloon');
        if ((works(am.super, am.super.h > 10) || tryIt(am.super)) && fuelMs > 1800) styles.push('bsuper');
      }
      if (airPass) styles.shift(); // the second pass only looks at air moves
      for (const style of styles)
      for (const dir of [null, 'left', 'right']) {
        if (isTabu(`save|${kind}|${type}|${dir}`)) continue;
        // an angled super jump pushes us that way while still on the ground: never toward a low
        // ball that's close on that side
        if (type === 'super' && dir && (dir === 'left' ? -1 : 1) * (s.ball.x - me.x) > 0 &&
            Math.abs(s.ball.x - me.x) < 130 && floor - s.ball.y < 70) continue;
        const ds = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
        const ta = lift + air / 2; // the top of the jump (after pressing)
        const hb = style === 'boost' ? (am.boost.n < 2 ? 20 : am.boost.h) : style === 'bsuper' ? (am.super.n < 2 ? 60 : am.super.h) : 0;
        const airB = hb > 0 ? 2 * Math.sqrt((2 * hb) / gMe) : 0;
        const holdT = style === 'balloon' ? Math.min(CFG.balloonMaxMs, fuelMs - 600) / 1000 : style === 'bsuper' ? 0.12 : 0;
        const yAt = (tj) => { // our height at time tj after pressing jump, for this style
          if (style === 'plain' || tj <= ta) { const u = Math.min(1, Math.max(0, (tj - lift) / air)); return me.y - h * 4 * u * (1 - u); }
          const top = me.y - h;
          let k = tj - ta, y = top;
          const bv = am.balloonVy.n < 2 ? -5 : am.balloonVy.v;
          if (holdT > 0) { if (k <= holdT) return top + bv * k; y = top + bv * holdT; k -= holdT; }
          if (airB > 0) { if (k <= airB) { const v = k / airB; return y - hb * 4 * v * (1 - v); } k -= airB; }
          return Math.min(floor, y + 0.5 * gMe * k * k);
        };
        for (const w of style === 'plain' ? waits : waits.filter((q) => q <= 0.3)) {
          for (const run of w > 0 && !opt.light ? [null, 'left', 'right'] : [null]) {
            const rs = run === 'left' ? -1 : run === 'right' ? 1 : 0;
            const T = Math.min(w + lift + air + holdT + airB, 2.2), N = Math.ceil(T * 60);
            let x = me.x, vx = me.vx, ok = null, minC = Infinity, kicked = false;
            if (style !== 'plain' && hyp(s.ball.x - me.x, s.ball.y - me.y) > 400) break;
            for (let i = 1; i <= N; i++) {
              const t = i / 60, dt = 1 / 60, tj = t - w;
              const airborne = tj > lift && (style !== 'plain' || tj < lift + air);
              if (tj < 0) { // waiting: running, or braking to a stop
                if (rs) vx = Math.max(-vMax, Math.min(vMax, vx + rs * gA * dt));
                else vx = Math.sign(vx) * Math.max(0, Math.abs(vx) - gA * dt);
              } else if (airborne && ds) vx = Math.max(-vMax, Math.min(vMax, vx + ds * aA * dt));
              else if (type === 'super' && ds && tj >= 0 && tj <= lift) vx = Math.max(-vMax, Math.min(vMax, vx + ds * gA * dt)); // angled super: pushing during lift-off
              if (type === 'super' && ds && !kicked && tj > lift) { kicked = true; vx += ds * brain.superSide.v; } // angled super jump
              x = Math.max(lo, Math.min(hi, x + vx * dt));
              const u = Math.min(1, Math.max(0, (tj - lift) / air));
              const y = tj < 0 ? me.y : yAt(tj);
              const bp = ballPos(s, t);
              const dist = hyp(bp.x - x, bp.y - y);
              if (dist - touch < killM(s)) break;                // it'd get us first
              minC = Math.min(minC, dist - touch);
              if (t > deadline) break;                           // too late: it's in
              if (tj > lift + CFG.regrabGapMs / 1000) {
                const ballD = dist - R;
                const otherD = Math.min(floor - y, Math.abs(s.ball.x - s.midX) < 30 ? Infinity : Math.abs(x - s.midX), s.side === 'left' ? x - s.bounds.minX : s.bounds.maxX - x); // (a ball sitting on the barrier is nearer than it)
                if (ballD <= CFG.grappleRange && dist >= CFG.grabMin && ballD <= otherD - CFG.nearestMargin) {
                  const vy = u > 0 && u < 1 ? -h * 4 * (1 - 2 * u) / air : 0;
                  if (grabClear(s, t, { x, y, vx, vy }) >= CFG.grabSafety) { ok = { t, x, y }; break; }
                }
              }
            }
            if (!ok) continue;
            // earliest catch; small costs for big jumps / air moves (grapple fuel) and running;
            // learned bonus; and what happened last time this same shot came
            const cand = { type, dir, wait: w, run, style, t: ok.t, at: ok, kind, key, minC };
            const memV = mem[planSig(cand)] ?? 0;
            if (memV < -0.4) continue; // this exact answer to this exact shot failed: try another
            const cost = ok.t + JUMP_ORDER.indexOf(type) * 0.04 + (style !== 'plain' ? 0.05 : 0) + (rs ? 0.03 : 0) +
                         (ds ? 0.01 : 0) - 0.15 * sc - 0.25 * memV;
            cand.cost = cost;
            if (!best || cost < best.cost) best = cand;
          }
        }
      }
    }
    }
    if (!opt.noCache) planCache = { at: now, plan: best, ball: s.ball };
    return best;
  }
  // A ball on the floor (rolling, not bouncing high) is only ever defended with a normal or a
  // grapple jump (regular / low) - jumping over it or catching it - never high or super.
  const floorBall = (s) => !!s.ball && (s.floorY ?? s.bounds.maxY) - s.ball.y < 30 && Math.abs(s.ball.vy) < 120;
  // (only for a shot rolling at us - a loose ball creeping along is offense, any jump goes)
  const floorShot = (s) => floorBall(s) && hyp(s.ball.vx, s.ball.vy) >= CFG.incomingSpeed;
  const defJumps = (s) => (floorShot(s) ? ['low', 'regular'] : JUMP_ORDER);
  let lastSave = null; // the planned save jump in progress: { kind, type, dir, at }
  // Let go now: does the ball's real flight actually make it over to their side?
  function reachesTheirSide(s) {
    for (const q of ballFlight(s)) {
      if (inNet(s, q.x, q.y, 'ours')) return false;
      if ((q.x - s.midX) * fwdSign(s.side) > CFG.centerMargin + (s.ballR || 10)) return true;
    }
    return false;
  }
  let planHold = null; // a save plan is waiting to jump (the safety check trusts it for a moment)
  let avoidingAt = 0;  // last time the safety check had to steer us away from the ball
  let avoidTight = false; // ...and even the best way out was a close call
  let airTrack = null; // measuring an air move: { kind, at, y0, minY, vys }
  function airLearnTick(s, now) {
    const a = airTrack;
    if (!a) return;
    a.minY = Math.min(a.minY, s.me.y);
    const floor = s.floorY ?? s.bounds.maxY;
    if (now - a.at < 900 && s.me.y < floor - CFG.floorNear) return;
    const am = brain.airMoves, rate = (m) => Math.max(0.3, 1 / (m.n + 1)); // first measurements count fully
    const gain = a.y0 - a.minY;
    if (a.kind === 'boost') { am.boost.h += rate(am.boost) * (gain - am.boost.h); am.boost.n++; }
    if (a.kind === 'bsuper') { am.super.h += rate(am.super) * (gain - am.super.h); am.super.n++; }
    if (a.kind === 'balloon' && a.vys.length > 3) {
      const v = a.vys.reduce((x, y) => x + y, 0) / a.vys.length;
      am.balloonVy.v += rate(am.balloonVy) * (v - am.balloonVy.v); am.balloonVy.n++;
    }
    lastLesson = `air move (${a.kind}): ${a.kind === 'balloon' ? `drift ${Math.round(am.balloonVy.v)}/s` : `+${Math.round(gain)} height`}`;
    airTrack = null;
    saveBrain();
  }
  // Would the ball, let go now, hit our back wall (the grey wall above our net) - not the net?
  function hitsOurBackwall(s) {
    const f = field(s), left = s.side === 'left', r = s.ballR || 10;
    let hit = false;
    const touch = CFG.playerRadius + r;
    for (const q of ballFlight(s)) {
      if (inNet(s, q.x, q.y, 'ours')) return false;   // in (before or after the bounce): no
      if (hyp(q.x - s.me.x, q.y - s.me.y) - touch < 30) return false; // the rebound mustn't come at us
      const atWall = left ? q.x <= f.net.x + r + 2 : q.x >= BONK_W - f.net.x - r - 2;
      if (atWall && !hit) { if (q.y >= f.net.y0) return false; hit = true; } // must hit ABOVE the net
      if (!hit && !onOurSide(s, q.x)) return false;
    }
    return hit; // hit the back wall and never dropped into the net afterwards
  }

  // ---- THE FUTURE-SCORING PLANNER (model predictive control). When there's no jump to make
  //      right now, it imagines each thing it could do with its feet - hold left, hold right,
  //      or stay - for a moment, works out where it and the ball would be, and from there runs
  //      the save planner. Each imagined future is scored:
  //        touching the ball         -> thrown out (the ball kills)
  //        a catch it can make       -> +500, more the sooner
  //        the ball going in, no catch -> -1000
  //        what top players did here -> a bonus (state-matched copying, see below)
  //        drifting far from our spot  -> a small cost
  //      and it does whatever leads to the best future. No fixed "go stand here" rules.
  const MPC_HOLD = 0.25; // seconds each imagined move is held
  function mpcMove(s, now, p, fuelOk, spot) {
    const me = s.me, gA = brain.move.groundAx, vMax = CFG.maxRunSpeed;
    const clone = cloneSuggest(s);
    const out = [];
    for (const h of [0, -1, 1]) {
      const c = moveClearance(s, h, MPC_HOLD);
      if (c < killM(s)) { out.push({ h, score: -Infinity, why: 'touches it' }); continue; }
      // where we'd be after holding it
      let x = me.x, vx = me.vx;
      for (let t = 0; t < MPC_HOLD; t += 1 / 60) {
        if (h) vx = Math.max(-vMax, Math.min(vMax, vx + h * gA / 60));
        else vx = Math.sign(vx) * Math.max(0, Math.abs(vx) - gA / 60);
        x = halfClamp(s, x + vx / 60);
      }
      const bp = ballPos(s, MPC_HOLD);
      const s2 = Object.assign({}, s, { me: { x, y: me.y, vx, vy: 0 }, ball: { x: bp.x, y: bp.y, vx: bp.vx, vy: bp.vy } });
      const p2 = pathInfo(s2);
      const plan = planSave(s2, now, p2, fuelOk, { light: true, noCache: true });
      let score;
      if (plan) score = 500 - 100 * (MPC_HOLD + plan.t);
      else if (p2.hitGoal || p.hitGoal) score = -1000;
      else score = 0;
      score += Math.min(30, c) * 0.5;                 // a little extra room is nice
      if (spot != null) score -= Math.abs(x + vx * 0.4 - spot) * CFG.spotWeight; // where that move is carrying us
      if (clone && clone.h === h) score += CFG.cloneBonus * clone.w;
      out.push({ h, score, plan, x });
    }
    out.sort((a, b) => b.score - a.score);
    return out[0].score > -Infinity ? out[0] : null;
  }

  // ---- STATE-MATCHED COPYING (k-nearest neighbours). While watching, every frame of a good
  //      player's successful save is kept as "situation -> what they pressed": the ball's
  //      position and speed relative to them, their own speed. In a new situation the bot finds
  //      the closest situations it has seen and how those players moved, and that becomes a
  //      bonus in the future-scoring above (a suggestion, not a macro - the noisy guesses of
  //      their keys can't make it do anything unsafe).
  function cloneSuggest(s) {
    const K = brain.knn;
    if (!K || K.length < 30 || !s.ball) return null;
    const m = s.side === 'right' ? -1 : 1, me = s.me, b = s.ball;
    const q = [(b.x - me.x) * m, b.y - me.y, b.vx * m * 0.15, b.vy * 0.15, me.vx * m * 0.15];
    const best = [];
    for (const k of K) {
      let d = 0;
      for (let i = 0; i < 5; i++) { const e = k.f[i] - q[i]; d += e * e; }
      if (best.length < 7) best.push({ d, k }); else if (d < best[6].d) best[6] = { d, k };
      best.sort((a, c) => a.d - c.d);
    }
    if (best[0].d > 60 * 60) return null; // nothing seen that's close
    const votes = { '-1': 0, 0: 0, 1: 0 };
    for (const { d, k } of best) votes[k.h * m] += k.w / (1 + Math.sqrt(d) / 20);
    const h = +Object.keys(votes).reduce((a, c) => (votes[c] > votes[a] ? c : a));
    const tot = votes['-1'] + votes[0] + votes[1];
    return { h, w: tot > 0 ? votes[h] / tot : 0 };
  }
  function learnClone(frames, name) { // frames of a successful save (left-side frame of reference)
    const w = skillOf(name);
    if (w < 0.45) return;
    const K = brain.knn || (brain.knn = []);
    for (const f of frames) {
      if (f.bx == null) continue;
      const k = unbits(f.k);
      K.push({ f: [f.bx, f.by, (f.bvx || 0) * 0.15, (f.bvy || 0) * 0.15, (f.vx || 0) * 0.15], h: k.l ? -1 : k.r ? 1 : 0, w });
    }
    while (K.length > CFG.knnMax) K.splice(Math.floor(Math.random() * K.length), 1);
    saveBrain();
  }

  // ==== THE PLANNER BRAIN (no rules) ====
  // Every decision is made the same way: imagine the futures each choice leads to, score them,
  // pick the best. The scores:
  //   touching the ball .............................. thrown out (the ball kills)
  //   the ball going into our net .................... -1000
  //   the ball into THEIR net ........................ +1000
  //   holding the ball (a catch we can make) ......... +500, more the sooner
  //   the ball getting over to their side ............ +300, more if it's hard for them to dodge
  //   a teammate able to catch it (a pass) ........... +350
  //   the ball dropping back on our side ............. -100
  //   being near the ball / our spot (when nothing above applies) ... small
  // What it has learned (its jumps, its push, the ball's bounce, how shots went, what top
  // players did) all feeds into these predictions and scores.

  // What would letting go of the ball like this be worth? (b = the ball's state at release,
  // meX/meY = where we'll be)
  function releaseValue(s, b, meX, meY) {
    const touch = CFG.playerRadius + (s.ballR || 10);
    let v = -100, crossed = false;
    const mates = s.players.filter((q) => q.side === s.side);
    for (const q of simFlight(s, b, 1.6, 1 / 30)) {
      if (inNet(s, q.x, q.y, 'ours')) return -1000;
      if (q.t < 0.9 && hyp(q.x - meX, q.y - meY) - touch < CFG.killMargin) return -1000;
      if (inNet(s, q.x, q.y, 'theirs')) return Math.max(v, 1000 - q.t * 100);
      if (!onOurSide(s, q.x) && (q.x - s.midX) * fwdSign(s.side) > CFG.centerMargin) {
        if (!crossed) { crossed = true; v = Math.max(v, 100); }
        if ((q.x - s.midX) * fwdSign(s.side) > CFG.solidCross) v = Math.max(v, 300); // clearly over (predictions aren't perfect)
        const sp = hyp(q.vx, q.vy);
        for (const e of s.enemies) {
          const tt = Math.min(q.t, 0.3);
          const d = hyp(q.x - (e.x + e.vx * tt), q.y - e.y);
          if (d < 60) v = Math.max(v, 300 + 500 * (1 - d / 60) * (1 - Math.min(1, q.t / 0.7)) * Math.min(1, sp / 250));
        }
      } else if (crossed) return v - 200; // it came back to us
      else if (q.t < 1.2) for (const m of mates) { // a pass: past a teammate, catchable, never into them
        const d = hyp(q.x - m.x, q.y - m.y) - touch;
        if (d < CFG.passClear) return -1000;
        if (d < 60 && CFG.passing) v = Math.max(v, 350);
      }
    }
    return v;
  }
  // Holding the ball: the value of letting go now, and of letting go at each moment over the
  // next 0.6 s if the swing just carries on around us.
  function planRelease(s, push) {
    const me = s.me, b0 = s.ball;
    // push = a key held for a moment while swinging: it speeds the ball up along the swing
    let b = b0;
    if (push) {
      const rx0 = b0.x - me.x, ry0 = b0.y - me.y, r0_ = hyp(rx0, ry0) || 1;
      const tx = -ry0 / r0_, ty = rx0 / r0_;                    // along the swing
      const a = brain.move.airAx * 0.15;                        // ~0.15 s of pushing
      const dv = (push.x * tx + push.y * ty) * a;
      b = { x: b0.x, y: b0.y, vx: b0.vx + dv * tx, vy: b0.vy + dv * ty };
    }
    const rx = b.x - me.x, ry = b.y - me.y, r = hyp(rx, ry) || 1;
    const w = (rx * (b.vy - me.vy) - ry * (b.vx - me.vx)) / (r * r);
    const th0 = Math.atan2(ry, rx);
    const nowV = push ? -Infinity : releaseOk(s, false) ? releaseValue(s, b, me.x, me.y) : -1000;
    let best = nowV, bestT = 0;
    for (let t = 0.05; t <= 0.6 + 1e-9; t += 0.05) {
      const th = th0 + w * t, mx = me.x + me.vx * t, my = Math.min(s.floorY ?? s.bounds.maxY, me.y + me.vy * t);
      const fb = { x: mx + r * Math.cos(th), y: my + r * Math.sin(th), vx: me.vx - Math.sin(th) * w * r, vy: Math.cos(th) * w * r };
      const v = releaseValue(s, fb, mx, my) - CFG.waitCost * t; // a release later is worth a bit less (things change)
      if (v > best) { best = v; bestT = t; }
    }
    return { now: nowV, best, bestT };
  }
  // In the air (not holding it): which way to steer? Each option traced 0.5 s ahead.
  function airSteer(s) {
    const me = s.me, floor = s.floorY ?? s.bounds.maxY, g = Math.max(100, brain.move.g), aA = brain.move.airAx;
    const touch = CFG.playerRadius + (s.ballR || 10), R = s.ballR || 10;
    let best = { h: 0, score: -Infinity };
    for (const h of [0, -1, 1]) {
      let x = me.x, y = me.y, vx = me.vx, vy = me.vy, minC = Infinity, score = null;
      for (let i = 1; i <= 30; i++) {
        const t = i / 60;
        vx = Math.max(-CFG.maxRunSpeed, Math.min(CFG.maxRunSpeed, vx + h * aA / 60)); vy += g / 60;
        x = halfClamp(s, x + vx / 60); y = Math.min(floor, y + vy / 60);
        const bp = ballPos(s, t), d = hyp(bp.x - x, bp.y - y);
        minC = Math.min(minC, d - touch);
        if (minC < killM(s)) break;
        const otherD = Math.min(floor - y, Math.abs(s.ball.x - s.midX) < 30 ? Infinity : Math.abs(x - s.midX), s.side === 'left' ? x - s.bounds.minX : s.bounds.maxX - x); // (a ball sitting on the barrier is nearer than it)
        if (score == null && d - R <= CFG.grappleRange && d >= CFG.grabMin && d - R <= otherD - CFG.nearestMargin) score = 500 - 100 * t;
      }
      if (minC < killM(s)) continue;
      const end = ballPos(s, 0.5);
      if (score == null) score = -hyp(end.x - x, end.y - y) * 0.5 + Math.min(minC, 40) * 0.5;
      if (score > best.score) best = { h, score };
    }
    return best;
  }

  // ---- THE BALL KILLS. Where will these keys carry us over the next safetyHorizon
  //      seconds (using our learned push and gravity), and how close does the ball get
  //      (surface to surface)? Walls and the floor stop us; the ball rolls on the floor.
  // holdT = how long the key is held; after that we brake to a stop (pressing the other
  // way). The bot's own moves are checked as "hold for one moment, can we still stop in
  // time?"; escape runs are checked as held all the way.
  function moveClearance(s, h, holdT = CFG.safetyHorizon) {
    const { me, ball } = s;
    if (!ball) return Infinity;
    const floor = s.floorY ?? s.bounds.maxY;
    const onFloor = me.y >= floor - CFG.floorNear;
    const push = onFloor ? brain.move.groundAx : brain.move.airAx;
    const touch = CFG.playerRadius + (s.ballR || 10);
    const T = CFG.safetyHorizon, N = 30, dt = T / N;
    let min = Infinity, vx = me.vx, mx = me.x;
    for (let i = 0; i <= N; i++) {
      const t = i * dt;
      if (i > 0) {
        if (t <= holdT && h) vx += h * push * dt;
        else vx = Math.sign(vx) * Math.max(0, Math.abs(vx) - push * dt); // braking
        vx = Math.max(-CFG.maxRunSpeed, Math.min(CFG.maxRunSpeed, vx));
        const want = halfClamp(s, mx + vx * dt);
        const got = blockedX(s, mx, want, onFloor ? me.y : Math.min(floor, me.y + me.vy * t + 0.5 * brain.move.g * t * t));
        if (got !== want) vx = 0; // ran into the barrier / a wall
        mx = got;
      }
      const my = onFloor ? me.y : Math.min(floor, me.y + me.vy * t + 0.5 * brain.move.g * t * t);
      const bp = ballPos(s, t), bx = bp.x, by = bp.y;
      min = Math.min(min, hyp(bx - mx, by - my) - touch);
    }
    return min;
  }

  // Check the keys the bot chose. If they'd take us within killMargin of touching the
  // ball, compare every alternative and take the one that keeps us furthest away:
  //   move left / right / stand still now,
  //   each jump (straight up or to either side) now, or after standing still a moment.
  // A jump, once started, is never restarted (that would keep us stuck on the ground);
  // in the air we can only steer left/right.
  let lastClearance = Infinity;
  function safetyLayer(s, keys, now) {
    if (!s.ball || mode === 'THROW') { lastClearance = Infinity; return keys; } // on the rope it can't reach us
    // On an opponent's rope and still far from us, it isn't flying free: its speed right now
    // says nothing about where it goes (that's read from the swing). No dodging a swing.
    const hb = ropeHolder(s);
    if (hb && hyp(s.ball.x - s.me.x, s.ball.y - s.me.y) > 160) { lastClearance = Infinity; return keys; }
    // A save plan that's waiting to jump traced our moves against the ball already (it never
    // lets the ball get within the margin before the catch): let it commit, don't run away.
    if (mode === 'WAIT_JUMP' && planHold && now - planHold.at < 60) { lastClearance = Infinity; return keys; }
    const onFloor = s.floorY != null && s.me.y >= s.floorY - CFG.floorNear;
    const h = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const withH = (hh) => {
      const out = new Set([...keys].filter((k) => k !== 'left' && k !== 'right'));
      if (hh < 0) out.add('left');
      if (hh > 0) out.add('right');
      return out;
    };

    if (mode === 'JUMP') {
      if (onFloor) { lastClearance = jumpClearance(s, jump.type, jump.dir); return keys; } // boosting: let it happen
      const planned = moveClearance(s, h, CFG.commitTime);
      lastClearance = planned;
      if (planned >= killM(s)) return keys;
      // ties go to moving AWAY from the ball (the same on either side: red and blue play alike)
      const away = s.ball.x > s.me.x ? -1 : 1;
      const best = [away, 0, -away].map((hh) => ({ hh, c: moveClearance(s, hh) })).reduce((x, y) => (y.c > x.c ? y : x));
      if (best.c <= planned) return keys;
      lastClearance = best.c;
      avoidingAt = now; avoidTight = best.c < killM(s) + CFG.avoidGrabGap;
      decision = `AVOIDING THE BALL in the air (${Math.round(planned)} -> ${Math.round(best.c)})`;
      return withH(best.hh);
    }

    const planned = moveClearance(s, h, CFG.commitTime);
    lastClearance = planned;
    if (planned >= killM(s)) return keys;

    // Options, least disruptive first (ties go to the earlier one).
    const awayG = s.ball.x > s.me.x ? -1 : 1;
    const options = [0, h ? -h : awayG, h || -awayG].filter((v, i, arr) => arr.indexOf(v) === i)
      .map((hh) => ({ hh, c: moveClearance(s, hh) }));
    const canJump = onFloor && lastRadar.length && lastRadar[0].kind === 'ground' &&
                    now - lastJumpEnd > CFG.jumpCooldownMs;
    if (canJump) {
      for (let w = CFG.safetyWaitStep; w <= CFG.safetyMaxWait + 1e-9; w += CFG.safetyWaitStep) {
        for (const type of defJumps(s)) {
          if (!hasFuel(JUMP_TYPES[type].boostMs())) continue;
          for (const dir of [null, 'left', 'right']) {
            const c = Math.min(jumpClearance(s, type, dir, w), dir ? jumpClearance(s, type, null, w) : Infinity);
            options.push({ jumpType: type, dir, wait: w, c });
          }
        }
      }
      for (const type of defJumps(s)) {
        if (!hasFuel(JUMP_TYPES[type].boostMs())) continue;
        for (const dir of [null, 'left', 'right']) {
          const c = Math.min(jumpClearance(s, type, dir, 0), dir ? jumpClearance(s, type, null, 0) : Infinity);
          options.push({ jumpType: type, dir, wait: 0, c });
        }
      }
    }
    // Anything clear by safeEnough counts as equally safe; then the least disruptive wins.
    const score = (o) => Math.min(o.c, CFG.safeEnough);
    const best = options.reduce((x, y) => (score(y) > score(x) ? y : x));
    if (score(best) <= Math.min(planned, CFG.safeEnough)) return keys; // nothing safer
    lastClearance = best.c;

    if (best.jumpType && best.wait > 0) { // the safe jump is a moment away: stand still for it
      setMode('ESCAPE');
      avoidingAt = now; avoidTight = best.c < killM(s) + CFG.avoidGrabGap;
      decision = `AVOIDING THE BALL: ${best.jumpType} jump in ${best.wait.toFixed(2)}s (clearance ${Math.round(best.c)})`;
      return withH(0);
    }
    if (best.jumpType) {
      const J = JUMP_TYPES[best.jumpType];
      jump = { type: best.jumpType, dir: best.dir, grab: true, label: 'escape', boostMs: J.boostMs(), up: J.up, heavy: J.heavy };
      jumpTrack = { type: best.jumpType, start: now, startY: s.me.y, minY: s.me.y, grabbed: false };
      setMode('JUMP');
      avoidingAt = now; avoidTight = best.c < killM(s) + CFG.avoidGrabGap;
      decision = `AVOIDING THE BALL: ${best.jumpType} jump${best.dir ? ' ' + best.dir : ''} (clearance ${Math.round(best.c)})`;
      const out = new Set(['grapple']);
      if (J.up) out.add('up');
      if (J.heavy) out.add('heavy');
      if (best.dir) out.add(best.dir);
      return out;
    }
    setMode('ESCAPE');
    avoidingAt = now; avoidTight = best.c < killM(s) + CFG.avoidGrabGap;
    decision = `AVOIDING THE BALL: ${best.hh < 0 ? 'left' : best.hh > 0 ? 'right' : 'standing still'} ` +
               `(${Math.round(planned)} -> ${Math.round(best.c)})`;
    return withH(best.hh);
  }

  // Pick a jump: only safe ones that reach high enough, the best-scoring for this kind of
  // shot. Sometimes it tries a different one on purpose, to keep learning. Returns null if
  // no jump is safe.
  function chooseJump(needH, bucket, s, dir, allowed = defJumps(s)) {
    const safeTypes = JUMP_ORDER.filter((t) => allowed.includes(t) && !jumpHitsBall(s, t, dir));
    if (!safeTypes.length) return null;
    let fits = safeTypes.filter((t) => brain.apex[t] >= needH);
    const freshFits = fits.filter((t) => !isTabu(`jump|${bucket}|${t}`));
    if (freshFits.length) fits = freshFits;
    if (!fits.length) fits = [safeTypes[safeTypes.length - 1]]; // biggest safe one
    const explore = Math.max(CFG.exploreMin, CFG.explore * Math.pow(0.97, brain.jumps));
    if (Math.random() < explore) {
      const next = JUMP_ORDER[Math.min(JUMP_ORDER.indexOf(fits[0]) + 1, JUMP_ORDER.length - 1)];
      const pool = [...new Set([...fits, next])].filter((t) => safeTypes.includes(t));
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const sc = brain.scores[bucket] || {};
    let best = fits[0], bestScore = -Infinity;
    for (const t of fits) {
      const v = (sc[t] ?? 0.2) - JUMP_ORDER.indexOf(t) * 0.05; // smaller jumps win ties
      if (v > bestScore) { bestScore = v; best = t; }
    }
    return best;
  }

  function reward(r, why) {
    if (!pending) return;
    const { bucket, type } = pending;
    if (r < 0) markTabu(`jump|${bucket}|${type}`); // try a different jump for this shot next time
    const sc = (brain.scores[bucket] = brain.scores[bucket] || {});
    const old = sc[type] ?? 0.2;
    sc[type] = old + CFG.learnRate * (r - old);
    lastLesson = `${type} jump on a ${bucket} shot: ${why} (${old.toFixed(2)} -> ${sc[type].toFixed(2)})`;
    pending = null;
    saveBrain();
  }

  // Keep the learned jumps sensible: a bad measurement (a grab mid-jump, a ramp) mustn't
  // leave the regular jump higher than the high jump or a 0.4 s lift-off.
  function sanitizeJumps() {
    const a = brain.apex, l = brain.lift, r = brain.air;
    for (const t of JUMP_ORDER) l[t] = Math.max(40, Math.min(300, l[t]));
    const gap = { regular: 8, high: 12, super: 25 };
    for (let i = 1; i < JUMP_ORDER.length; i++) {
      const t = JUMP_ORDER[i], p = JUMP_ORDER[i - 1];
      a[t] = Math.max(a[t], a[p] + gap[t]);
      r[t] = Math.max(r[t], r[p] + 30);
    }
  }
  function learnTick(s, now) {
    if (jumpTrack) { // measure the jump: lift-off delay, height and time in the air
      const jt = jumpTrack;
      if (!jt.grabbed) jt.minY = Math.min(jt.minY, s.me.y);
      if (!jt.liftAt && jt.startY - s.me.y > 3) jt.liftAt = now;
      // a directional super jump: how much sideways speed did it give us (beyond normal air push)?
      if (jt.type === 'super' && jt.dir && jt.liftAt && !jt.sideDone && now - jt.liftAt > 100) {
        jt.sideDone = true;
        const sg = jt.dir === 'left' ? -1 : 1;
        const air = brain.move.airAx * (now - jt.liftAt) / 1000;          // what plain air push would add
        const kick = Math.max(0, (s.me.vx - jt.vx0) * sg - air);
        const ss = brain.superSide, lr = Math.max(0.3, 1 / (ss.n + 1));
        ss.v += lr * (kick - ss.v); ss.n++;
        lastLesson = `super jump ${jt.dir}: angled ${Math.round(kick)} sideways (learned ${Math.round(ss.v)})`;
      }
      const landed = jt.liftAt && now - jt.liftAt > 80 && s.me.y >= jt.startY - 2;
      if (landed || now - jt.start > 2500) {
        const h = jt.startY - jt.minY;
        if (jt.liftAt && h > 5) {
          const lr = CFG.learnRate, t = jt.type;
          // Lift-off happens before any grab, so it's learned from every jump. A grab pulls
          // on us, so height only counts if we'd already peaked, and air time only if we
          // never grabbed.
          brain.lift[t] += lr * (jt.liftAt - jt.start - brain.lift[t]);
          if (!jt.grabbed || jt.pastPeak) brain.apex[t] += lr * (h - brain.apex[t]);
          if (!jt.grabbed && landed) brain.air[t] += lr * (now - jt.liftAt - brain.air[t]);
          brain.jumps++;
          sanitizeJumps();
          saveBrain();
        }
        jumpTrack = null;
      }
    }
    if (pendingPickup) { // did the offense regrab work?
      if (mode === 'THROW' && !grabInfo.save) pickupResult(1, 'regrabbed it');
      else if (mode !== 'JUMP' && now - pendingPickup.at > 250) pickupResult(-0.3, 'missed the regrab');
      else if (now - pendingPickup.at > 2500) pickupResult(-0.3, 'missed the regrab');
    }
    if (pending) { // did it work?
      const age = now - pending.at;
      const goal = goalFor(s);
      if (mode === 'THROW') reward(1, 'grabbed it');
      else if (s.ball && inNet(s, s.ball.x, s.ball.y, 'ours')) reward(-1, 'ball went in');
      else if (s.ball && !onOurSide(s, s.ball.x) && age > 300) reward(0.6, 'ball went back over');
      else if (age > CFG.outcomeMs) reward(-0.2, 'missed');
    }
  }
  // ---- Learning offense pickups. For a loose ball, how far away to stand and which
  //      grapple jump (never the super jump: that's for defence) gets us above the ball so
  //      it becomes the nearest thing and we can regrab it. Scored on every attempt:
  //      +1 regrabbed it, -0.3 missed, -1 died.
  let pickupPlan = null;    // { d, t, key, at } chosen for the current loose ball
  let pendingPickup = null; // { key, at } an attempt waiting for its result
  function heightBand(s, ball) {
    const h = (s.floorY ?? s.bounds.maxY - 40) - ball.y;
    return h < 30 ? 'floor' : h < 80 ? 'low' : 'high';
  }
  function choosePickup(s, ball, now) {
    const hb = heightBand(s, ball);
    let cands = [];
    for (const d of CFG.pickupDists) for (const t of CFG.offenseJumps) cands.push({ d, t, key: `${hb}|${d}|${t}` });
    const fresh = cands.filter((c) => !isTabu('pickup|' + c.key)); // never repeat an approach that just failed
    if (fresh.length) cands = fresh;
    const explore = Math.max(CFG.exploreMin, CFG.explore * Math.pow(0.95, brain.pickupTries || 0));
    let pick;
    if (Math.random() < Math.max(explore, unpredictability(s) * 0.5)) pick = cands[Math.floor(Math.random() * cands.length)];
    else pick = cands.reduce((a, b) => ((brain.pickups[b.key] ?? 0.3) > (brain.pickups[a.key] ?? 0.3) ? b : a));
    return Object.assign({ at: now }, pick);
  }
  function pickupResult(r, why) {
    if (!pendingPickup) return;
    const k = pendingPickup.key, old = brain.pickups[k] ?? 0.3;
    if (r < 0) markTabu('pickup|' + k);
    brain.pickups[k] = old + CFG.learnRate * (r - old);
    brain.pickupTries = (brain.pickupTries || 0) + 1;
    lastLesson = `pickup (${k.replace(/\|/g, ', ')}): ${why} (${old.toFixed(2)} -> ${brain.pickups[k].toFixed(2)})`;
    pendingPickup = null;
    saveBrain();
  }

  function learnDeath() {
    if (lastSave && performance.now() - lastSave.at < 3000) { // that save plan got us killed
      rememberShot(lastSave, false);
      markTabu(`save|${lastSave.kind}|${lastSave.type}|${lastSave.dir}`);
      lastLesson = `died on a ${lastSave.type} jump ${lastSave.dir || 'straight up'} vs a ${lastSave.kind} shot: trying another way next time`;
      lastSave = null;
    }
    pickupResult(-1, 'died');
    if (pending) reward(-1, 'died');
    jumpTrack = null;
  }
  // ---- Offense learning. A "play" is a throw: how far from the barrier it was released,
  //      how high, which way the ball flew (angle, measured toward the other side), how
  //      fast, and whether the thrower was in the air. Plays come from two places:
  //   copied: the opponent's throws, scored by how dangerous they were to us
  //           (1 = went in / killed us, 0.7 = forced us to dodge or jump, else low)
  //   mine:   our own throws, scored by what happened (+1 an opponent died or it reached
  //           their net, 0 it came straight back, -0.1 nothing)
  //   When throwing, the bot copies the best-scoring play (and sometimes tries another).
  let watchThrow = null;   // an opponent's throw we're following
  let myThrow = null;      // our own throw we're following
  let prevBall = null;
  let currentPlay = null;  // the play we're trying to copy in this throw
  const fwdSign = (side) => (side === 'left' ? 1 : -1); // +x direction toward the other side

  function addPlay(play, score) {
    // Merge with a similar play instead of piling up near-duplicates.
    const same = brain.plays.find((q) => Math.abs(wrap(q.angle - play.angle)) < 0.15 &&
      Math.abs(q.dist - play.dist) < 40 && Math.abs(q.height - play.height) < 40);
    if (same) {
      same.score += CFG.learnRate * (score - same.score);
      same.seen = (same.seen || 1) + 1;
      if (play.source === 'copied') same.source = same.source === 'mine' ? 'both' : same.source;
      if (play.from) same.from = play.from;
    } else {
      brain.plays.push(Object.assign({}, play, { score, seen: 1 }));
      if (brain.plays.length > CFG.maxPlays) {
        brain.plays.sort((a, b) => b.score - a.score);
        brain.plays.length = CFG.maxPlays;
      }
    }
    saveBrain();
  }

  const tabu = new Map(); // "kind|key" -> until: approaches/throws/jumps that just failed
  const isTabu = (k) => (tabu.get(k) || 0) > performance.now();
  const markTabu = (k) => tabu.set(k, performance.now() + CFG.tabuMs);
  const playKey = (q) => `play|${q.from || 'me'}|${q.angle.toFixed(2)}|${Math.round(q.speed)}`;
  const moveKey = (q) => `move|${q.from}|${q.angle.toFixed(2)}|${q.frames.length}`;

  function pickPlay() {
    const good = brain.plays.filter((q) => q.score > CFG.playMinScore && !isTabu(playKey(q)));
    if (!good.length) return null;
    if (Math.random() < Math.max(CFG.exploreMin, CFG.explore * Math.pow(0.97, brain.jumps))) {
      return good[Math.floor(Math.random() * good.length)];
    }
    return good.reduce((a, b) => (b.score > a.score ? b : a));
  }

  function offenseTick(s, now) {
    const ball = s.ball;
    if (!ball) { prevBall = null; return; }
    const floor = s.floorY ?? s.bounds.maxY - 40;

    // 1. Spot an opponent's release: they had the ball on the rope a moment ago, they
    //    don't now, and it's flying toward our side, clearly further from them than it
    //    was on the rope.
    if (!watchThrow && s.enemies.length && !onOurSide(s, ball.x)) {
      const towardUs = ball.vx * fwdSign(s.side) < -CFG.incomingSpeed;
      const speed = hyp(ball.vx, ball.vy);
      if (towardUs && speed > CFG.copyMinSpeed) {
        let thrower = null;
        for (const e of s.enemies) {
          const o = oppTrack.get(e.name);
          if (!o || !o.holdAt || now - o.holdAt > CFG.releaseWindowMs || (o.last && o.last.g)) continue;
          if (hyp(e.x - ball.x, e.y - ball.y) > o.holdDist + CFG.releaseMargin) { thrower = e; break; }
        }
        if (thrower) {
          const mv = recordMove(thrower.name);
          if (mv) {
            mv.angle = Math.atan2(ball.vy, -ball.vx * fwdSign(s.side)); // release direction, left frame
            mv.speed = speed;
          }
          const ot0 = oppTrack.get(thrower.name);
          watchThrow = {
            at: now, threat: 0.2, move: mv, holdMs: ot0 && ot0.holdStart ? ot0.holdAt - ot0.holdStart : null,
            team: s.players.filter((p) => p.side === s.side).length + (s.me ? 1 : 0),
            play: {
              source: 'copied', from: thrower.name,
              dist: Math.abs(thrower.x - s.midX), height: floor - thrower.y,
              angle: Math.atan2(ball.vy, -ball.vx * fwdSign(s.side)), // toward the other side
              speed, airborne: floor - thrower.y > 15,
            },
          };
        }
      }
    }

    // 2. Follow the opponent's throw: how dangerous did it turn out?
    if (watchThrow) {
      const w = watchThrow;
      // False alarm: they've got it on the rope again.
      const ot = oppTrack.get(w.play.from);
      if (ot && ot.last && ot.last.g && ot.holdAt > w.at && now - w.at < 800 && !onOurSide(s, ball.x)) {
        watchThrow = null;
        prevBall = { x: ball.x, y: ball.y };
        return;
      }
      if (onOurSide(s, ball.x)) w.crossed = true; // their throw made it over to us
      if (s.me && onOurSide(s, ball.x)) {
        const p = pathInfo(s);
        if (p.hitGoal) w.threat = Math.max(w.threat, 1);
        else if (p.hitMe || mode === 'JUMP' || mode === 'DODGE') w.threat = Math.max(w.threat, 0.7);
      }
      const goal = goalFor(s);
      const scored = inNet(s, ball.x, ball.y, 'ours');
      if (scored) w.threat = 1;
      const teamNow = s.players.filter((p) => p.side === s.side).length + (s.me ? 1 : 0);
      if (w.team != null && teamNow < w.team) w.threat = 1; // it killed one of us
      const backOver = !onOurSide(s, ball.x) && now - w.at > 600;
      if (scored || backOver || now - w.at > CFG.outcomeMs) {
        addPlay(w.play, w.threat);
        if (w.move) addMove(w.move, w.threat);
        credit(w.play.from, !!w.crossed); // the lesson: did they grapple it and get it over? (dying = fail, via watchDeaths)
        learnHold(w.holdMs, !!w.crossed);
        lastLesson = `copied ${w.play.from}'s throw (${Math.round(w.play.angle * -57.3)}deg, ` +
                     `${Math.round(w.play.speed)} speed): danger ${w.threat.toFixed(1)}`;
        watchThrow = null;
      }
    }

    // 3. Follow our own throw.
    if (myThrow) {
      const m = myThrow;
      let result = null;
      if (!onOurSide(s, ball.x) && (ball.x - s.midX) * fwdSign(s.side) > CFG.centerMargin) m.crossed = true;
      // The lesson: did I grapple it and get it to their side? (a kill / their net = even better)
      if (s.enemies.length < m.enemies) result = [1, 'got it over and took one out'];
      else if (inNet(s, ball.x, ball.y, 'theirs')) result = [1, 'got it over, into their net'];
      else if (m.crossed && (onOurSide(s, ball.x) || now - m.at > CFG.outcomeMs)) result = [0.7, 'grappled it and got it to their side'];
      else if (!m.crossed && ((onOurSide(s, ball.x) && now - m.at > 500 && ball.vx * fwdSign(s.side) <= 0) || now - m.at > CFG.outcomeMs))
        result = [0, "didn't get it to their side"];
      if (result) {
        addPlay(m.play, result[0]);
        // Throws that come back weren't hard enough: next time swing harder before letting
        // go. Good throws ease it back toward normal.
        if (result[0] === 0) brain.throwPower = Math.min(CFG.maxThrowPower, brain.throwPower * 1.12);
        else if (result[0] > 0) brain.throwPower = Math.max(1, brain.throwPower * 0.97);
        if (m.move) { m.move.score += CFG.learnRate * (result[0] - m.move.score); saveBrain(); }
        const good = result[0] > 0;
        learnHold(m.holdMs, good);
        review('Shots', good, `${m.target === 'player' ? 'aimed at ' + m.targetName : m.target === 'net' ? 'aimed at their net' :
          m.target === 'replay' ? 'replayed a shot' : 'copied a throw'}: ${result[1]}`);
        if (m.target === 'net' || m.target === 'player') {
          brain.targets[m.target].tries++;
          if (good) brain.targets[m.target].wins++;
          lastTargetFailed = good ? null : m.target;
        }
        for (const n of m.enemyNames || []) {
          const arr = (brain.vs[n] = brain.vs[n] || []);
          arr.push(good ? 1 : 0);
          if (arr.length > CFG.vsMemory) arr.shift();
        }
        if (!good) { // don't try the exact same throw next time
          if (m.play && m.play.source !== 'mine') markTabu(playKey(m.play));
          if (m.move) markTabu(moveKey(m.move));
        }
        if (good && m.own) { // a shot that worked: keep it (smoothed) to replay later
          addMove({ frames: smoothFrames(m.own.frames), holdIdx: 0, from: 'me', angle: m.own.angle, speed: m.own.speed, dtMs: frameSpacing(m.own.frames) }, 1);
        }
        saveBrain();
        lastLesson = `my throw (${m.play.source === 'mine' ? 'own' : 'copied from ' + (m.play.from || '?')}): ${result[1]}`;
        myThrow = null;
      }
    }
    prevBall = { x: ball.x, y: ball.y };
  }

  // ---- Copying the opponent's defence: when an opponent jumps at a ball on their side,
  //      measure how high they went, match it to our closest jump type, and nudge that
  //      jump's score for this kind of shot up (their save worked: ball came back over)
  //      or down (it didn't).
  const oppJumps = new Map(); // opponent name -> jump being watched
  function watchOpponentJumps(s, now) {
    const floor = s.floorY, ball = s.ball;
    if (floor == null || !ball) return;
    const names = new Set(s.enemies.map((e) => e.name));
    for (const name of [...oppJumps.keys()]) if (!names.has(name)) oppJumps.delete(name); // died/left
    for (const e of s.enemies) {
      const up = floor - e.y;
      const w = oppJumps.get(e.name);
      if (!w) {
        if (up > 15 && e.vy < -60 && !onOurSide(s, ball.x) && hyp(ball.x - e.x, ball.y - e.y) < CFG.watchJumpRange) {
          oppJumps.set(e.name, { start: now, minY: e.y, ballVy: ball.vy, saved: false });
        }
        continue;
      }
      w.minY = Math.min(w.minY, e.y);
      if (onOurSide(s, ball.x)) w.saved = true; // they got it back over to us
      const landed = now - w.start > 150 && up < 4;
      if (landed || now - w.start > 2500) {
        const h = floor - w.minY;
        const type = JUMP_ORDER.reduce((a, b) => (Math.abs(brain.apex[b] - h) < Math.abs(brain.apex[a] - h) ? b : a));
        const bucket = bucketFor(h, { vy: w.ballVy });
        const sc = (brain.scores[bucket] = brain.scores[bucket] || {});
        const old = sc[type] ?? 0.2;
        sc[type] = old + CFG.learnRate * CFG.imitateWeight * ((w.saved ? 1 : 0) - old);
        brain.imitated = (brain.imitated || 0) + 1;
        lastLesson = `watched ${e.name}: ~${Math.round(h)} high jump (= my ${type}) on a ${bucket} ball, ` +
                     `${w.saved ? 'saved it' : 'no save'}`;
        oppJumps.delete(e.name);
        saveBrain();
      }
    }
  }

  // ---- Our own movement model: while we hold exactly one of left/right (no grapple), our
  //      acceleration tells us how hard that key pushes, on the ground and in the air. In
  //      free fall we learn gravity, and with Up held how much Up lifts.
  let prevMe = null;
  function learnMyMovement(s, now) {
    const me = s.me;
    if (prevMe && me.vx === prevMe.vx && me.vy === prevMe.vy && now - prevMe.t < 200) return; // no new reading yet
    if (prevMe && now - prevMe.t > 4 && now - prevMe.t < 200) {
      const dt = (now - prevMe.t) / 1000;
      const ax = (me.vx - prevMe.vx) / dt, ay = (me.vy - prevMe.vy) / dt;
      const onFloor = s.floorY != null && me.y >= s.floorY - CFG.floorNear;
      const k = prevMe.keys, mm = brain.move, lr = CFG.moveLearnRate;
      const dir = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
      const nearWall = me.x - s.bounds.minX < 30 || s.bounds.maxX - me.x < 30 ||
                       Math.abs(me.x - s.midX) < CFG.wallMargin + 15;
      const stuck = Math.abs(me.vx) < 10 && Math.abs(prevMe.vx) < 10; // frozen / pinned
      if (!k.has('grapple') && !nearWall && !stuck && Math.abs(ax) < 5000 && Math.abs(ay) < 5000) {
        if (dir) {
          const key = onFloor ? 'groundAx' : 'airAx';
          mm[key] = Math.max(50, mm[key] + lr * (ax * dir - mm[key]));
        }
        if (!onFloor && !k.has('up') && !k.has('down')) mm.g = Math.max(50, mm.g + lr * (ay - mm.g));
        if (!onFloor && k.has('up') && !k.has('down')) mm.upAy = Math.max(0, mm.upAy + lr * ((mm.g - ay) - mm.upAy));
        // heavy (X) and down both pull us down harder: learn how much, so we can tell them apart on others
        if (!onFloor && k.has('down') && !k.has('heavy') && !k.has('up')) mm.downAy = Math.max(0, (mm.downAy ?? 150) + lr * ((ay - mm.g) - (mm.downAy ?? 150)));
        if (!onFloor && k.has('heavy') && !k.has('down') && !k.has('up')) mm.heavyAy = Math.max(0, (mm.heavyAy ?? 350) + lr * ((ay - mm.g) - (mm.heavyAy ?? 350)));
      }
    }
    prevMe = { vx: me.vx, vy: me.vy, t: now, keys: new Set(held) };
  }

  // ---- Reading the opponent's inputs. bonk doesn't show anyone's key presses, so they're
  //      inferred from motion using our own movement model:
  //        left/right = accelerating sideways like our keys do
  //        up/down    = rising/falling differently from free fall (in the air)
  //        grapple    = holding the ball (the rope keeps a steady distance while the ball
  //                     swings around them), or a ground boost (shooting up off the floor)
  //      The last few seconds are kept per opponent, stored as if they were on the left.
  const oppTrack = new Map(); // name -> { prev, frames, last }
  const bits = (k) => (k.l ? 1 : 0) | (k.r ? 2 : 0) | (k.u ? 4 : 0) | (k.d ? 8 : 0) | (k.g ? 16 : 0) | (k.h ? 32 : 0);
  const unbits = (b) => ({ l: !!(b & 1), r: !!(b & 2), u: !!(b & 4), d: !!(b & 8), g: !!(b & 16), h: !!(b & 32) });
  function readOpponentInputs(s, now) {
    const floor = s.floorY, ball = s.ball, mm = brain.move;
    const names = new Set(s.players.map((e) => e.name));
    for (const n of [...oppTrack.keys()]) if (!names.has(n)) oppTrack.delete(n);
    for (const e of s.players) {
      let o = oppTrack.get(e.name);
      if (!o) { o = { prev: null, frames: [], last: null }; oppTrack.set(e.name, o); }
      const onFloor = floor != null && e.y >= floor - CFG.floorNear;
      const bd = ball ? hyp(ball.x - e.x, ball.y - e.y) : Infinity;
      // No new reading of them since last tick: they're still pressing what they were.
      // Repeat the last frame (so frames stay one per tick) without re-reading inputs.
      if (o.prev && e.x === o.prev.x && e.y === o.prev.y && e.vx === o.prev.vx && e.vy === o.prev.vy &&
          (!ball || (ball.x === o.prev.bxAbs && ball.y === o.prev.byAbs)) && now - o.prev.t < 200 && o.frames.length) {
        o.frames.push(Object.assign({}, o.frames[o.frames.length - 1], { t: now }));
        while (o.frames.length && now - o.frames[0].t > CFG.moveMemoryMs) o.frames.shift();
        continue;
      }
      if (o.prev && now - o.prev.t > 4 && now - o.prev.t < 200) {
        const dt = (now - o.prev.t) / 1000;
        const ax = (e.vx - o.prev.vx) / dt, ay = (e.vy - o.prev.vy) / dt;
        const push = (onFloor ? mm.groundAx : mm.airAx) * CFG.inputThreshold;
        const holding = !!ball && bd < CFG.grappleRange * 1.3 && o.prev.bd < CFG.grappleRange * 1.3 &&
                        Math.abs(bd - o.prev.bd) < CFG.ropeSteady && hyp(ball.vx, ball.vy) > 40;
        const boost = o.prev.onFloor && e.vy < -150;
        const k = {
          l: !holding && ax < -push,
          r: !holding && ax > push,
          u: !onFloor && !holding && ay < mm.g - mm.upAy * 0.5,
          d: false, h: false,
          g: holding || boost,
        };
        // Falling faster than gravity = down or heavy (X). Heavy pulls harder than down, so
        // whichever learned pull the extra is closer to decides which it was.
        if (!onFloor && !holding) {
          const extra = ay - mm.g, dn = mm.downAy ?? 150, hv = mm.heavyAy ?? 350;
          if (extra > Math.min(dn, hv) * 0.5) {
            if (Math.abs(extra - hv) < Math.abs(extra - dn)) k.h = true; else k.d = true;
          }
        }
        if (holding) { // on the rope, sideways pushes still show as the swing speeding up
          const sp = hyp(ball.vx, ball.vy), psp = o.prev.bsp || sp;
          if (sp - psp > CFG.ropeSteady * 3) { if (e.vx < 0) k.l = true; else k.r = true; }
        }
        const m = e.side === 'right' ? -1 : 1; // mirror into the left-side frame
        const kk = m > 0 ? k : Object.assign({}, k, { l: k.r, r: k.l });
        o.frames.push({
          t: now, k: bits(kk), near: bd < CFG.grappleRange * 1.3, hold: holding,
          bx: ball ? Math.round((ball.x - e.x) * m) : 0, by: ball ? Math.round(ball.y - e.y) : 0,
          bvx: ball ? Math.round(ball.vx * m) : 0, bvy: ball ? Math.round(ball.vy) : 0,
          px: Math.round((s.midX - e.x) * m), onF: onFloor, // distance from the barrier, on the floor
          vx: Math.round(e.vx * m),
        });
        while (o.frames.length && now - o.frames[0].t > CFG.moveMemoryMs) o.frames.shift();
        o.last = k;
        if (holding) { if (!o.holdAt || now - o.holdAt > 250) o.holdStart = now; o.holdAt = now; o.holdDist = bd; }
      }
      // Their grapple meter (estimated, same 5 s use / 5 s refill as ours): drains while they
      // hold the ball or boost off the floor, refills otherwise.
      if (o.fuelT == null) { o.fuel = CFG.grappleMaxMs; o.fuelT = now; }
      { const dtm = Math.min(200, now - o.fuelT); o.fuelT = now;
        const using = (o.holdAt && now - o.holdAt < 60) || (o.last && o.last.g);
        o.fuel = Math.max(0, Math.min(CFG.grappleMaxMs, o.fuel + (using ? -dtm : dtm))); }
      o.x = e.x; o.y = e.y;
      o.prev = { vx: e.vx, vy: e.vy, x: e.x, y: e.y, bxAbs: ball ? ball.x : null, byAbs: ball ? ball.y : null,
                 t: now, bd, onFloor, bsp: ball ? hyp(ball.vx, ball.vy) : 0 };
    }
  }

  // Cut an opponent's shot out of their recent frames: from a little before they took hold
  // of the ball up to the release.
  // Average time between recorded frames (moves are replayed by time, not by tick count).
  const frameSpacing = (fr) => (fr.length > 1 && fr[fr.length - 1].t > fr[0].t
    ? (fr[fr.length - 1].t - fr[0].t) / (fr.length - 1) : CFG.tickMs);
  // Step a replay forward by the time that's passed, at the speed it was recorded.
  const MOVE_DT_OLD = 1000 / 30; // moves saved before 2.9 were recorded at 30 per second
  function advanceReplay(r, m, now) {
    const dtm = m.dtMs || MOVE_DT_OLD;
    if (r.pos == null) r.pos = r.i;
    r.pos += Math.min(4, (now - (r.lastAt ?? now - decideDt)) / dtm);
    r.lastAt = now;
    r.i = Math.floor(r.pos);
  }
  const slimFrame = (q) => ({ k: q.k, bx: q.bx, by: q.by, bvx: q.bvx || 0, bvy: q.bvy || 0, px: q.px, onF: !!q.onF });
  function recordMove(name) {
    const o = oppTrack.get(name);
    if (!o || o.frames.length < 5) return null;
    const f = o.frames;
    let i = f.length - 1;
    while (i > 0 && !f[i].near) i--;          // last frame they were holding it
    let hold = i;
    while (hold > 0 && f[hold - 1].near) hold--; // first frame of the hold
    let start = hold;
    while (start > 0 && f[hold].t - f[start - 1].t <= CFG.approachMs) start--;
    const frames = f.slice(start, i + 1).map(slimFrame);
    if (frames.length < 4) return null;
    return { frames, holdIdx: hold - start, from: name, dtMs: frameSpacing(f.slice(start, i + 1)) };
  }

  function addMove(move, score) {
    const same = brain.moves.find((q) => q.from === move.from && Math.abs(wrap(q.angle - move.angle)) < 0.15 &&
                                     Math.abs(q.frames.length - move.frames.length) < 8);
    if (same) {
      same.score += CFG.learnRate * (score - same.score);
      same.seen = (same.seen || 1) + 1;
    } else {
      brain.moves.push(Object.assign({}, move, { score, seen: 1 }));
      if (brain.moves.length > CFG.maxMoves) {
        brain.moves.sort((a, b) => b.score - a.score);
        brain.moves.length = CFG.maxMoves;
      }
    }
    saveBrain();
  }

  function pickMove() {
    const good = brain.moves.filter((q) => q.score > CFG.moveMinScore && q.frames.length > q.holdIdx + 2 &&
                                          !isTabu(moveKey(q)) && !dudPlayer(q.from));
    if (!good.length) return null;
    if (Math.random() < CFG.exploreMin) return good[Math.floor(Math.random() * good.length)];
    const val = (q) => q.score + skillAdj(q.from); // better players' shots first
    return good.reduce((a, b) => (val(b) > val(a) ? b : a));
  }

  // ---- Watching teammates' throws (and, while we're dead, everyone keeps being watched):
  //      a teammate who had the ball on the rope and let it fly toward the other side.
  //      Scored by what it did to the other team (1 = killed someone / reached their net,
  //      0 = came straight back, 0.2 = nothing much), and kept as a play + a move to copy.
  let teamThrow = null;
  function watchTeammateThrows(s, now) {
    const ball = s.ball;
    if (!ball) return;
    const floor = s.floorY ?? s.bounds.maxY - 40;
    const mates = s.players.filter((p) => p.side === s.side);
    if (!teamThrow && mates.length) {
      const awayFromUs = ball.vx * fwdSign(s.side) > CFG.incomingSpeed;
      const speed = hyp(ball.vx, ball.vy);
      if (awayFromUs && speed > CFG.copyMinSpeed) {
        const thrower = mates.find((e) => {
          const o = oppTrack.get(e.name);
          return o && o.holdAt && now - o.holdAt <= CFG.releaseWindowMs && !(o.last && o.last.g) &&
                 hyp(e.x - ball.x, e.y - ball.y) > o.holdDist + CFG.releaseMargin;
        });
        if (thrower) {
          const angle = Math.atan2(ball.vy, ball.vx * fwdSign(s.side)); // toward the other side
          const mv = recordMove(thrower.name);
          if (mv) { mv.angle = angle; mv.speed = speed; }
          const ot1 = oppTrack.get(thrower.name);
          teamThrow = {
            at: now, move: mv, enemies: s.enemies.length, holdMs: ot1 && ot1.holdStart ? ot1.holdAt - ot1.holdStart : null,
            play: { source: 'copied', from: thrower.name, dist: Math.abs(thrower.x - s.midX),
                    height: floor - thrower.y, angle, speed, airborne: floor - thrower.y > 15 },
          };
        }
      }
    }
    if (teamThrow) {
      const t = teamThrow;
      // False alarm: they've got it back on the rope (it was just the swing).
      const ot = oppTrack.get(t.play.from);
      if (ot && ot.last && ot.last.g && ot.holdAt > t.at && now - t.at < 800) { teamThrow = null; return; }
      let r = null;
      if (!onOurSide(s, ball.x) && (ball.x - s.midX) * fwdSign(s.side) > CFG.centerMargin) t.crossed = true;
      if (s.enemies.length < t.enemies) r = [1, 'killed one of them'];
      else if (inNet(s, ball.x, ball.y, 'theirs')) r = [1, 'reached their net'];
      else if (onOurSide(s, ball.x) && now - t.at > 500) r = [0, 'came back'];
      else if (now - t.at > CFG.outcomeMs) r = [0.2, 'nothing much'];
      if (r) {
        addPlay(t.play, r[0]);
        if (t.move) addMove(t.move, r[0]);
        credit(t.play.from, !!t.crossed);
        learnHold(t.holdMs, !!t.crossed);
        lastLesson = `watched teammate ${t.play.from}'s throw: ${r[1]}`;
        teamThrow = null;
      }
    }
  }

  // ---- Who's actually good: every watched player gets a record of how often what they
  //      do works (their throws were dangerous, their saves went back over, they won
  //      kickoffs) vs. didn't (throws came to nothing, they died). Moves are copied mostly
  //      from the players who win, and hardly at all from the ones who don't.
  function credit(name, good) {
    if (!name || good == null) return;
    const r = brain.skill[name] || (brain.skill[name] = { g: 0, b: 0 });
    if (good) r.g++; else r.b++;
    saveBrain();
  }
  const skillOf = (name) => { const r = brain.skill[name]; return r ? (r.g + 1) / (r.g + r.b + 2) : 0.5; };
  const skillAdj = (name) => (skillOf(name) - 0.5) * 0.8;
  const dudPlayer = (name) => { const r = brain.skill[name]; return !!r && r.g + r.b >= 6 && skillOf(name) < 0.25; };
  let aliveSeen = new Set();
  function watchDeaths(s) { // a player who vanishes while the ball is in play died
    const now = new Set(s.players.map((p) => p.name));
    if (s.ball && !s.kickoff) for (const n of aliveSeen) if (!now.has(n)) credit(n, false);
    aliveSeen = now;
  }

  // ---- Reading their swing before they let go: an opponent has the ball on the rope. For
  //      each point in the next 0.6 s of the swing, work out where the ball would go if they
  //      released it there (real flight, with bounces). They'll let go when it's aimed at
  //      us, so the dangerous releases count most. Where those come down = where to lean.
  function ropeHolder(s) { // an opponent who has the ball on their rope right now
    const ball = s.ball, now = performance.now();
    if (!ball) return null;
    return s.enemies.find((e) => {
      const o = oppTrack.get(e.name);
      if (!o || !o.holdAt || now - o.holdAt > 100) return false;
      const d = hyp(e.x - ball.x, e.y - ball.y);
      return d < CFG.grappleRange * 1.3 && Math.abs(d - (o.holdDist ?? d)) < CFG.ropeSteady * 2;
    }) || null;
  }
  let swingRead = { at: 0, spot: null };
  function readSwing(s, now) {
    if (now - swingRead.at < 100) return swingRead.spot;
    swingRead = { at: now, spot: null };
    const ball = s.ball;
    if (!ball || onOurSide(s, ball.x)) return null;
    const holder = ropeHolder(s);
    if (!holder) return null;
    const rx = ball.x - holder.x, ry = ball.y - holder.y, r = hyp(rx, ry);
    if (r < 10) return null;
    const w = (rx * (ball.vy - holder.vy) - ry * (ball.vx - holder.vx)) / (r * r); // how fast it's going round
    if (Math.abs(w) < 1) return null;
    const th0 = Math.atan2(ry, rx), goal = goalFor(s), fs = fwdSign(s.side);
    const floor = s.floorY ?? s.bounds.maxY - 40;
    let sw = 0, sx = 0, sx2 = 0;
    for (let t = 0; t <= 0.6 + 1e-9; t += 0.05) {
      const th = th0 + w * t;
      const b = { x: holder.x + holder.vx * t + r * Math.cos(th), y: holder.y + r * Math.sin(th),
                  vx: holder.vx - Math.sin(th) * w * r, vy: Math.cos(th) * w * r };
      if (b.vx * fs > -CFG.incomingSpeed) continue; // this release wouldn't come our way
      let land = null, danger = 0;
      for (const q of simFlight(s, b, 1.4, 1 / 30)) {
        if (!onOurSide(s, q.x)) continue;
        if (goal) danger = Math.max(danger, 1 - Math.min(1, hyp(q.x - goal.x, q.y - goal.y) / 250));
        if (land == null && q.y >= floor - 40 && q.vy > 0) land = q.x;
      }
      if (land == null) continue;
      const wgt = 0.3 + danger;
      sw += wgt; sx += wgt * land; sx2 += wgt * land * land;
    }
    if (sw < 0.5) return null;
    const mean = sx / sw;
    swingRead.spot = { x: mean, spread: Math.sqrt(Math.max(0, sx2 / sw - mean * mean)), from: holder.name };
    return swingRead.spot;
  }

  // ---- Rating a shot before taking it: if we let go right now, where does the ball go
  //      (real flight, with wall bounces)? Into their net = 1. Past an opponent close and
  //      early (little time to dodge) = up to 1. Deep on their side = a little. Coming back
  //      to us or near our net = bad.
  function shotValue(s, b) {
    const path = simFlight(s, b, 1.5, 1 / 30);
    const goal = goalFor(s), net = s.enemyGoal, fs = fwdSign(s.side);
    const floor = s.floorY ?? s.bounds.maxY - 40;
    let v = 0, crossed = false;
    for (const q of path) {
      if (inNet(s, q.x, q.y, 'ours')) return -1;
      if (!onOurSide(s, q.x)) crossed = true;
      else if (crossed) return -0.5;
      if (!crossed) continue;
      if (inNet(s, q.x, q.y, 'theirs')) v = Math.max(v, 1);
      const sp = hyp(q.vx, q.vy);
      for (const e of s.enemies) {
        const tt = Math.min(q.t, 0.3); // after that they've reacted: assume they stop
        const d = hyp(q.x - (e.x + e.vx * tt), q.y - Math.min(floor, e.y + e.vy * tt));
        if (d < 60) v = Math.max(v, Math.min(1, 0.3 + (1 - d / 60) * (1 - 0.5 * Math.min(1, q.t / 0.6)) * Math.min(1, sp / 300)));
      }
    }
    if (!crossed) return -0.5;
    const end = path[path.length - 1];
    const depth = (end.x - s.midX) * fs / Math.max(1, Math.abs(s.bounds.maxX - s.midX));
    return Math.max(v, 0.25 * depth);
  }
  let shotState = { willFake: false, faked: false, fakeUntil: 0, last: null };

  // ---- Teammates: who's got the ball, and is someone better placed than us?
  function teamInfo(s, now) {
    const ball = s.ball, me = s.me;
    const mates = s.players.filter((p) => p.side === s.side);
    if (!ball || !mates.length) return { mates, holding: null, closer: null };
    const holding = mates.find((m) => {
      const o = oppTrack.get(m.name);
      return o && o.holdAt && now - o.holdAt < 150 && hyp(m.x - ball.x, m.y - ball.y) < CFG.grappleRange * 1.3;
    }) || null;
    const myD = hyp(ball.x - me.x, ball.y - me.y);
    const closer = mates.filter((m) => hyp(ball.x - m.x, ball.y - m.y) < myD - CFG.teamGap)
      .sort((a, b) => hyp(ball.x - a.x, ball.y - a.y) - hyp(ball.x - b.x, ball.y - b.y))[0] || null;
    return { mates, holding, closer };
  }

  // ---- PASSING. With the ball on the rope and a teammate on our side, it can pass: let go so
  //      the ball comes past a spot NEAR the teammate - in front of them (toward the barrier),
  //      behind them, above or below them - never at them (the ball kills them too). Close
  //      enough to be the nearest thing for their grapple, never closer than passClear to
  //      their body. Which spot works is learned: a pass is good if the teammate grabs it,
  //      bad if it misses, goes in our net, or kills them. Passes between other players are
  //      watched too (where the ball was, relative to the one who caught it).
  const PASS_SPOTS = ['front', 'behind', 'above', 'below'];
  const passRate = (k) => { const r = brain.passes[k]; return r ? (r.g + 1) / (r.g + r.b + 2) : 0.5; };
  function passSpotPos(s, mate, spot, t) {
    const floor = s.floorY ?? s.bounds.maxY, fs = fwdSign(s.side), o = CFG.passOffset;
    const tt = Math.min(t, 0.3); // they keep moving a little, then react
    const mx = mate.x + mate.vx * tt, my = Math.min(floor, mate.y + mate.vy * tt);
    if (spot === 'front') return { x: mx + fs * o, y: my - 10 };
    if (spot === 'behind') return { x: mx - fs * o, y: my - 10 };
    if (spot === 'above') return { x: mx, y: my - o - 10 };
    return { x: mx, y: Math.min(floor - 5, my + o) }; // below (only useful when they're up in the air)
  }
  function choosePass(s, now) {
    if (!CFG.passing || !s.ball) return null;
    const mates = s.players.filter((p) => p.side === s.side);
    if (!mates.length) return null;
    const tries = Object.values(brain.passes).reduce((a, r) => a + r.g + r.b, 0);
    const good = Object.values(brain.passes).reduce((a, r) => a + r.g, 0);
    const chance = Math.min(CFG.passChanceMax, CFG.passChance + (tries >= 4 ? (good / tries) * 0.4 : 0));
    if (Math.random() > chance) return null;
    const mate = mates.reduce((a, b) => (skillOf(b.name) > skillOf(a.name) ? b : a)); // the best teammate
    const floor = s.floorY ?? s.bounds.maxY;
    let spots = PASS_SPOTS.filter((k) => !(k === 'below' && floor - mate.y < 50) && !isTabu('pass|' + k));
    if (!spots.length) spots = ['front', 'behind', 'above'];
    const spot = Math.random() < 0.25 ? spots[Math.floor(Math.random() * spots.length)]
      : spots.reduce((a, b) => (passRate(b) > passRate(a) ? b : a));
    return { mate: mate.name, spot, at: now };
  }
  // If we let go now, does the ball come past the spot near the teammate (and never at them)?
  function passWindow(s, pass) {
    const mate = s.players.find((p) => p.name === pass.mate);
    if (!mate) return null;
    const touch = CFG.playerRadius + (s.ballR || 10);
    let near = Infinity;
    // The whole flight, not just the part near the spot: if they don't grab it, it must still
    // never come down on them.
    for (const q of simFlight(s, s.ball, 2.0, 1 / 30)) {
      if (inNet(s, q.x, q.y, 'ours')) return null;
      if (!onOurSide(s, q.x)) break; // gone over to their side: can't hurt our teammate
      const tt = Math.min(q.t, 0.3);
      const dm = hyp(q.x - (mate.x + mate.vx * tt), q.y - (mate.y + mate.vy * tt)) - touch;
      if (dm < CFG.passClear) return null;                  // too close to them: that'd kill them
      if (q.t > 1.2) continue;
      const sp = passSpotPos(s, mate, pass.spot, q.t);
      near = Math.min(near, hyp(q.x - sp.x, q.y - sp.y));
    }
    return near < 30 ? { near } : null;
  }
  let myPass = null; // a pass in flight: { mate, spot, at }
  let passNow = null; // set just before letting go for a pass
  function passTick(s, now) {
    if (!myPass) return;
    const p = myPass;
    const o = oppTrack.get(p.mate);
    const alive = s.players.some((q) => q.name === p.mate);
    let r = null;
    if (!alive) r = [false, 'it got my teammate killed'];
    else if (o && o.holdStart && o.holdStart > p.at && o.holdAt - o.holdStart > 150) r = [true, `${p.mate} grabbed it`];
    else if (s.ball && inNet(s, s.ball.x, s.ball.y, 'ours')) r = [false, 'it went in our net'];
    else if (now - p.at > 1800) r = [false, 'they never got it'];
    if (!r) return;
    const rec = brain.passes[p.spot] || (brain.passes[p.spot] = { g: 0, b: 0 });
    if (r[0]) rec.g++; else { rec.b++; markTabu('pass|' + p.spot); }
    mlReward(r[0] ? CFG.mlRewardPassGood : CFG.mlRewardPassBad);
    mlVerdict('Passes', r[0]);
    brain.review[r[0] ? 'goodPasses' : 'badPasses'] = (brain.review[r[0] ? 'goodPasses' : 'badPasses'] || 0) + 1;
    lastReview = `${r[0] ? 'GOOD' : 'BAD'} PASS (${p.spot} of ${p.mate}): ${r[1]}`;
    myPass = null;
    saveBrain();
  }
  // Watching passes between other players: one lets go, a teammate of theirs grabs it soon
  // after. Where the ball was relative to the catcher says which spot it was.
  let watchedRelease = null;
  function watchPasses(s, now) {
    const ball = s.ball;
    if (!ball) return;
    for (const e of s.players) {
      const o = oppTrack.get(e.name);
      if (!o) continue;
      if (o.holdAt && now - o.holdAt > 60 && now - o.holdAt < 120 && (!watchedRelease || watchedRelease.at < o.holdAt - 200))
        watchedRelease = { name: e.name, side: e.side, at: o.holdAt };
    }
    const w = watchedRelease;
    if (!w || now - w.at > 1800) { if (w && now - w.at > 1800) watchedRelease = null; return; }
    for (const e of s.players) {
      if (e.name === w.name || e.side !== w.side) continue;
      const o = oppTrack.get(e.name);
      if (o && o.holdStart && o.holdStart > w.at && o.holdStart - w.at < 1500) {
        const m = e.side === 'left' ? 1 : -1, dx = (ball.x - e.x) * m, dy = ball.y - e.y;
        const spot = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'front' : 'behind') : (dy < 0 ? 'above' : 'below');
        const rec = brain.passes[spot] || (brain.passes[spot] = { g: 0, b: 0 });
        rec.g++;
        lastLesson = `watched ${w.name} pass to ${e.name} (${spot} of them)`;
        watchedRelease = null;
        saveBrain();
        return;
      }
    }
  }

  // ---- Copying what we've watched (copy-first). Offense, defence and kickoffs all start
  //      by looking for a move we watched someone else pull off from a situation like ours
  //      (where the ball is and how it's moving relative to us, how far we are from the
  //      barrier). If one fits, we press what they pressed, frame by frame, mirrored to our
  //      side - including heavy (X) and grapple jumps - and grab when they grabbed. Our own
  //      routines are only the fallback. Each copy is scored by how it went for US, and one
  //      that failed isn't tried again straight away.
  let copy = null;         // { m, kind, i, at, boostUntil }
  let lastCopy = null;     // a defensive copy that grabbed, waiting for the save's verdict
  const copyBlock = {};    // kind -> use our own routine until this time
  const copyList = (kind) => (kind === 'def' ? brain.defMoves : kind === 'kick' ? brain.kickMoves : brain.moves);
  const copyKey = (m) => `${m.from}|${m.frames.length}|${m.frames[0] ? m.frames[0].bx + ',' + m.frames[0].by : ''}`;
  const kindName = (k) => (k === 'def' ? 'save' : k === 'kick' ? 'kickoff' : 'shot');
  function ctxNow(s) {
    const mir = s.side === 'right' ? -1 : 1, me = s.me, b = s.ball;
    return { bx: (b.x - me.x) * mir, by: b.y - me.y, bvx: b.vx * mir, bvy: b.vy, px: (s.midX - me.x) * mir };
  }
  const ctxDist = (f, c) => hyp(f.bx - c.bx, f.by - c.by) + 0.12 * hyp((f.bvx || 0) - c.bvx, (f.bvy || 0) - c.bvy) +
                            (f.px != null ? 0.35 * Math.abs(f.px - c.px) : 30);
  function findCopy(s, kind) {
    const c = ctxNow(s), found = [];
    const minScore = kind === 'off' ? CFG.moveMinScore : 0.4;
    for (const m of copyList(kind)) {
      if (!m.frames || m.holdIdx == null || (m.score ?? 0) < minScore || isTabu('copy|' + copyKey(m)) || dudPlayer(m.from)) continue;
      let bi = -1, bd = CFG.copyMatch;
      for (let i = 0; i < m.holdIdx; i++) {
        const d = ctxDist(m.frames[i], c);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0 && m.holdIdx - bi >= 2) found.push({ m, i: bi, fit: (m.score ?? 0.5) - bd / 150 + skillAdj(m.from) });
    }
    if (!found.length) return null;
    found.sort((a, b) => b.fit - a.fit);
    const top = found.slice(0, Math.max(1, CFG.copyTop + Math.round(unpredictability(s) * 2)));
    return top[Math.floor(Math.random() * top.length)];
  }
  function tryCopy(s, kind, now) {
    if (!s.ball || mode === 'COPY' || (copyBlock[kind] || 0) > now) return false;
    const f = findCopy(s, kind);
    if (!f) return false;
    const cs = brain.copyStats, grabRate = (cs.grabs + 2) / (cs.tries + 4);
    const chance = CFG.copyFirst * Math.max(0.15, Math.min(1, grabRate * 3)); // copies that never get the ball: rarely
    if (Math.random() > chance) { copyBlock[kind] = now + 1500; return false; } // our own way this time
    copy = { m: f.m, kind, i: f.i, at: now, boostUntil: 0 };
    if (kind !== 'def') lastOffenseAt = now;
    brain.copyStats.tries++;
    setMode('COPY');
    return true;
  }
  function copyResult(c, r, why) {
    const m = c.m, old = m.score ?? 0.5;
    m.score = old + CFG.learnRate * (r - old);
    m.used = (m.used || 0) + 1;
    if (r < 0.3) markTabu('copy|' + copyKey(m)); // didn't work for us: try something else next time
    lastLesson = `copy of ${m.from}'s ${kindName(c.kind)}: ${why} (${old.toFixed(2)} -> ${m.score.toFixed(2)})`;
    saveBrain();
  }
  function addCopy(list, move, score) {
    const f0 = move.frames[0];
    const same = list.find((q) => q.from === move.from && q.frames[0] &&
                                  hyp(q.frames[0].bx - f0.bx, q.frames[0].by - f0.by) < 25 &&
                                  Math.abs(q.frames.length - move.frames.length) < 8);
    if (same) { same.score += CFG.learnRate * (score - same.score); same.seen = (same.seen || 1) + 1; }
    else {
      list.push(Object.assign({}, move, { score, seen: 1 }));
      if (list.length > CFG.maxCopies) { list.sort((a, b) => b.score - a.score); list.length = CFG.maxCopies; }
    }
    saveBrain();
  }

  // ---- Watching saves: from the moment a thrown ball comes at a player until they've got
  //      it on the rope and it's gone back over (a save we can copy). Everyone is watched,
  //      teammates and opponents, alive or dead.
  const defWatch = new Map();
  function watchDefense(s, now) {
    const ball = s.ball;
    const names = new Set(s.players.map((e) => e.name));
    for (const n of [...defWatch.keys()]) if (!names.has(n)) defWatch.delete(n); // died: nothing to copy
    if (!ball) return;
    for (const e of s.players) {
      const o = oppTrack.get(e.name);
      if (!o || !o.frames.length) continue;
      const fs = e.side === 'left' ? 1 : -1;
      const theirHalf = (x) => (e.side === 'left' ? x < s.midX : x > s.midX);
      let ep = defWatch.get(e.name);
      if (!ep) {
        const atThem = ball.vx * fs < -CFG.incomingSpeed && hyp(ball.vx, ball.vy) > CFG.copyMinSpeed &&
                       Math.abs(ball.x - e.x) < 300 && !(o.holdAt && now - o.holdAt < 300);
        if (atThem) defWatch.set(e.name, { at: now });
        continue;
      }
      if (!ep.heldAt && o.holdAt && o.holdAt > ep.at) ep.heldAt = o.holdAt;
      const theirGoal = e.side === s.side ? goalFor(s) : s.enemyGoal;
      if (inNet(s, ball.x, ball.y, e.side === s.side ? 'ours' : 'theirs')) { credit(e.name, false); defWatch.delete(e.name); continue; }
      if (ep.heldAt && now - ep.heldAt > 1500) { // not hit, not in (1.5 s later), and they grappled it: a save
        const fr = o.frames.filter((q) => q.t >= ep.at - 100 && q.t <= ep.heldAt + 400);
        const hi = fr.findIndex((q) => q.hold || q.t >= ep.heldAt);
        if (fr.length >= 4 && hi >= 1) {
          addCopy(brain.defMoves, { frames: fr.map(slimFrame), holdIdx: hi, from: e.name, kind: 'def', dtMs: frameSpacing(fr) }, 1);
          learnClone(fr.slice(0, hi + 1), e.name); // and every moment of it, for state-matched copying
          credit(e.name, true);
          lastLesson = `watched ${e.name}'s save: learned it (${brain.defMoves.length} saves known)`;
        }
        defWatch.delete(e.name);
        continue;
      }
      if (now - ep.at > 3500) defWatch.delete(e.name);
    }
  }

  // ---- Watching kickoffs: whoever grabs the ball first after it starts, and whether they
  //      dragged it to their side and lived. Those approaches are kept to copy.
  let kickWatch = null, prevKickoff = false;
  function watchKickoffs(s, now) {
    const ball = s.ball;
    if (s.kickoff && !prevKickoff) kickWatch = { at: now, holder: null };
    prevKickoff = !!s.kickoff;
    const kw = kickWatch;
    if (!kw || !ball || s.kickoff) return;
    if (now - kw.at > 8000) { kickWatch = null; return; }
    if (!kw.holder) {
      for (const e of s.players) {
        const o = oppTrack.get(e.name);
        if (o && o.holdAt > kw.at) { kw.holder = e.name; kw.heldAt = o.holdAt; kw.side = e.side; break; }
      }
      if (!kw.holder) return;
    }
    const e = s.players.find((p) => p.name === kw.holder);
    if (!e) { kickWatch = null; return; } // died with it
    const depth = (s.midX - ball.x) * (kw.side === 'left' ? 1 : -1);
    if (depth >= CFG.kickoffDragDepth * 0.7) {
      const o = oppTrack.get(kw.holder);
      const fr = o.frames.filter((q) => q.t >= kw.at && q.t <= now);
      const hi = fr.findIndex((q) => q.t >= kw.heldAt);
      if (fr.length >= 4 && hi >= 1) {
        addCopy(brain.kickMoves, { frames: fr.map(slimFrame), holdIdx: hi, from: kw.holder, kind: 'kick', dtMs: frameSpacing(fr) }, 1);
        credit(kw.holder, true);
        lastLesson = `watched ${kw.holder} win the kickoff: learned it`;
      }
      kickWatch = null;
    } else if (now - kw.heldAt > 2500) kickWatch = null;
  }

  // ---- Our own kickoffs: did it go well or badly? Good = we won it (dragged it to our
  //      side, or it ended up ours / took one of them out). Bad = they got to it first, it
  //      came flying at our net, we died, or they had it at the end. Each of our kickoff
  //      approaches is scored so the bad ones get dropped.
  let kickEp = null, kickoffWasOn = false, kickoffWonAt = 0;
  let threatText = '-';
  let planText = '-';
  let decideDt = 1000 / 30; // measured time between decisions (ms)
  function kickoffTick(s, now) {
    if (s.kickoff && (!kickEp || kickEp.touched)) { // a new kickoff (new round): fresh episode, fresh ball clock
      kickEp = { at: now, plan: null, copy: null, enemies: s.enemies.length };
      grabClock = null;
    }
    kickoffWasOn = !!s.kickoff;
    const ep = kickEp, ball = s.ball;
    if (!ep || !ball) return;
    // Kickoff: grabbed it = success. They grabbed it first, or it got away onto their side
    // with nobody holding it = fail. Until one of those happens it isn't over: the bot keeps
    // going for it (it doesn't go back to wait in the middle).
    if (mode === 'THROW') return judgeKickoff(true, 'grabbed it');
    if (!s.kickoff && !ep.touched) ep.touched = now;
    const enemyHeld = s.enemies.some((e) => { const o = oppTrack.get(e.name); return o && o.holdAt > ep.at; });
    if (enemyHeld) return judgeKickoff(false, 'they grabbed it first');
    const theirDepth = (ball.x - s.midX) * fwdSign(s.side); // how far onto THEIR side
    if (ep.touched && theirDepth > CFG.centerMargin) return judgeKickoff(false, 'the ball went to their side');
  }
  // Is the kickoff still being fought over? (nobody has it yet)
  const kickContest = (s) => !!kickEp && !!s.ball;
  function judgeKickoffDeath() {
    if (kickEp) judgeKickoff(false, 'died');
  }
  function judgeKickoff(good, why) {
    const ep = kickEp;
    kickEp = null;
    if (!ep) return;
    brain.review[good ? 'goodKickoffs' : 'badKickoffs']++;
    lastReview = `${good ? 'GOOD' : 'BAD'} KICKOFF: ${why}`;
    mlReward(good ? CFG.mlRewardKickGood : CFG.mlRewardKickBad);
    mlVerdict('Kickoffs', good);
    const r = good ? 1 : -0.5;
    if (ep.plan) {
      const k = ep.plan, old = brain.kickoffPlans[k] ?? 0.3;
      brain.kickoffPlans[k] = old + CFG.learnRate * (r - old);
      if (!good) markTabu('kick|' + k);
    }
    if (ep.copy) copyResult(ep.copy, Math.max(0, r), good ? 'kickoff went well' : 'kickoff went badly');
    saveBrain();
  }
  function chooseKickoff(s, ball, now) {
    const hb = heightBand(s, ball);
    let cands = [];
    for (const d of CFG.pickupDists) for (const t of CFG.offenseJumps) cands.push({ d, t, key: `${hb}|${d}|${t}` });
    const fresh = cands.filter((c) => !isTabu('kick|' + c.key)); // a kickoff that just went badly: something else
    if (fresh.length) cands = fresh;
    const sc = (c) => brain.kickoffPlans[c.key] ?? brain.pickups[c.key] ?? 0.3;
    const pick = Math.random() < Math.max(CFG.exploreMin, unpredictability(s) * 0.5)
      ? cands[Math.floor(Math.random() * cands.length)]
      : cands.reduce((a, b) => (sc(b) > sc(a) ? b : a));
    return Object.assign({ at: now }, pick);
  }

  // ---- The grab clock: punished for being too slow to get the ball. While the ball is loose
  //      on our side (nobody on our team holding it, not a teammate's ball) or sitting at
  //      kickoff, a clock runs. If we haven't grabbed it in time, whatever we were trying gets
  //      punished - the pickup approach, the kickoff approach, the copied move - and dropped
  //      for a while, so the next try is something different. It keeps punishing every
  //      further period until we get it. The clock resets when we grab it or it leaves.
  let grabClock = null; // { at, kick, punished }
  function grabClockTick(s, now) {
    const ball = s.ball;
    const mine = mode === 'THROW';
    const kick = !!s.kickoff || (kickContest(s) && !ropeHolder(s));
    const loose = !!ball && !mine && (kick || onOurSide(s, ball.x)) && !teamInfo(s, now).holding;
    if (!loose) { grabClock = null; return; }
    if (!grabClock || grabClock.kick !== kick) grabClock = { at: now, kick, punished: 0 };
    const limit = kick ? CFG.kickoffDeadlineMs : CFG.grabDeadlineMs;
    const due = Math.floor((now - grabClock.at) / limit);
    if (due <= grabClock.punished) return;
    if (mode === 'JUMP') return; // mid-jump: let this attempt finish first, then judge
    grabClock.punished = due;
    const pen = CFG.slowPenalty, what = [];
    if (kick && kickEp && kickEp.plan) {
      const k = kickEp.plan, old = brain.kickoffPlans[k] ?? 0.3;
      brain.kickoffPlans[k] = old - pen; markTabu('kick|' + k); what.push(`kickoff approach ${k.replace(/\|/g, '/')}`);
      kickEp.plan = null;
    }
    if (pickupPlan) {
      const k = pickupPlan.key, old = brain.pickups[k] ?? 0.3;
      brain.pickups[k] = old - pen; markTabu('pickup|' + k); what.push(`pickup ${k.replace(/\|/g, '/')}`);
      pickupPlan = null; // pick a different one now
    }
    if (copy) { copyResult(copy, 0, 'too slow to get the ball'); what.push(`copy of ${copy.m.from}`); copy = null; if (mode === 'COPY') setMode('IDLE'); }
    brain.review.tooSlow = (brain.review.tooSlow || 0) + 1;
    mlReward(CFG.mlRewardSlow);
    mlVerdict('slow', false);
    lastReview = `TOO SLOW: no grab in ${((now - grabClock.at) / 1000).toFixed(1)}s` +
                 (what.length ? ` - punished ${what.join(', ')}, trying something else` : '');
    saveBrain();
  }

  // ---- Self-review: after every save and shot the bot tells itself how it went.
  let lastReview = '';
  let pendingSave = null;  // a save we let go of, waiting to see if it worked
  let lastConceded = 0;
  function review(kind, good, why) {
    brain.review[(good ? 'good' : 'bad') + kind]++;
    mlReward(kind === 'Saves' ? (good ? CFG.mlRewardSaveGood : CFG.mlRewardSaveBad) : (good ? CFG.mlRewardShotGood : CFG.mlRewardShotBad));
    mlVerdict(kind, good);
    if (kind === 'Saves') stanceResult(good ? 1 : -1);
    if (kind === 'Saves' && lastSave && performance.now() - lastSave.at < 6000) { // remember how this answer to this shot went
      rememberShot(lastSave, good);
      if (!good) lastSave = null;
    }
    if (kind === 'Saves' && lastCopy && performance.now() - lastCopy.at < 4000) { // that save was a copy
      copyResult(lastCopy.c, good ? 1 : 0, good ? 'good save' : 'bad save');
      lastCopy = null;
    }
    lastReview = `${good ? 'GOOD' : 'BAD'} ${kind === 'Saves' ? 'SAVE' : 'SHOT'}: ${why}`;
    saveBrain();
  }
  const reviewText = () => {
    const r = brain.review;
    return `${lastReview || '-'}  (saves ${r.goodSaves} good/${r.badSaves} bad, no-verdict ${r.wallSaves || 0}, shots ${r.goodShots} good/${r.badShots} bad, too slow ${r.tooSlow || 0}, ` +
           `kickoffs ${r.goodKickoffs} good/${r.badKickoffs} bad, passes ${r.goodPasses || 0} good/${r.badPasses || 0} bad)`;
  };
  // Defence, the bot asks itself in order: Did I get hit? (yes = fail, and that approach
  // gets dropped). If not: did it go in our net? (yes = fail). If not: did I grapple it and
  // save it? (yes = success). If not: it must have hit the back wall (no verdict).
  // Offense: Did I die setting up a shot? (fail). Did I grapple it and get it to their side?
  // (yes = success, no = fail).
  let defEp = null;        // an incoming shot being defended: { at }
  let lastOffenseAt = 0;   // last time we were setting up / taking a shot
  function reviewDeath() {
    const now = performance.now();
    if (!defEp && now - lastOffenseAt < 2500) review('Shots', false, 'died setting up a shot');
    else review('Saves', false, 'got hit by the ball: need a new approach for that shot');
    defEp = null;
    pendingSave = null;
  }
  function reviewTick(s, now) {
    const ball = s.ball, bi = s.ballInfo;
    if (!ball) return;
    if (inNet(s, ball.x, ball.y, 'ours') && now - lastConceded > 2000) {
      lastConceded = now;
      review('Saves', false, defEp && defEp.grabbedAt ? 'I touched it but it still went in - not a save' : "wasn't hit, but it went in our net");
      defEp = null; pendingSave = null;
      return;
    }
    const ownClear = lastReleaseTarget === 'backwall' && now - lastReleaseAt < CFG.clearIgnoreMs;
    const floor = s.floorY ?? s.bounds.maxY;
    const slowRoll = floor - ball.y < 30 && bi && bi.speed < CFG.slowRoll;
    if (!defEp && bi && bi.towardOurNet && bi.speed > CFG.incomingSpeed && !ownClear && !slowRoll &&
        mode !== 'THROW' && (onOurSide(s, ball.x) || Math.abs(ball.x - s.midX) < 120)) defEp = { at: now };
    if (!defEp) return;
    // Grappled it: only a save if it doesn't still go in afterwards.
    if (mode === 'THROW' && grabInfo.at >= defEp.at - 50 && !defEp.grabbedAt) defEp.grabbedAt = now; // any grab during the shot
    if (defEp.grabbedAt) {
      const away = !onOurSide(s, ball.x) && ball.vx * fwdSign(s.side) > 0;
      if (away || (now - defEp.grabbedAt > 2500 && mode !== 'THROW')) {
        review('Saves', true, 'not hit, not in - grappled it and saved it');
        defEp = null;
      }
      return;
    }
    const gone = !onOurSide(s, ball.x) && ball.vx * fwdSign(s.side) > CFG.incomingSpeed;
    if (gone || now - defEp.at > 4000 || (bi && bi.speed < 20 && now - defEp.at > 800)) { // gone over, or come to rest
      brain.review.wallSaves = (brain.review.wallSaves || 0) + 1;
      lastReview = 'NO VERDICT: not hit, not in, no grab - assumed it hit the back wall';
      defEp = null;
    }
  }

  // ---- Grapple control: how long a hold makes a throw that gets over (ours and watched).
  function learnHold(ms, good) {
    if (ms == null || !(ms > 0)) return;
    const b = Math.min(12, Math.floor(ms / 250));
    const r = brain.holds[b] || (brain.holds[b] = { g: 0, b: 0 });
    if (good) r.g++; else r.b++;
    saveBrain();
  }
  function bestHold() { // the hold length that works best, once it's seen enough
    let best = null;
    for (const [k, r] of Object.entries(brain.holds)) {
      const n = r.g + r.b;
      if (n < 4) continue;
      const rate = (r.g + 1) / (n + 2);
      if (!best || rate > best.rate) best = { ms: +k * 250, rate, n };
    }
    return best;
  }

  // ---- Movement: where the good players wait while the ball is on the other side (their
  //      distance from the barrier, weighted by how good they are) - the 'copied' stance.
  const posSeen = new Map();
  function watchPositions(s, now) {
    const ball = s.ball;
    if (!ball) return;
    const floor = s.floorY ?? s.bounds.maxY;
    for (const e of s.players) {
      if ((posSeen.get(e.name) || 0) > now - 250) continue;
      const ballOther = e.side === 'left' ? ball.x > s.midX : ball.x < s.midX;
      if (!ballOther || floor - e.y > 10 || Math.abs(e.vx) > 120) continue;
      const w = skillOf(e.name);
      if (w < 0.45) continue;
      posSeen.set(e.name, now);
      const d = Math.abs(e.x - s.midX), pl = brain.posLearn;
      pl.d = pl.d == null ? d : pl.d + 0.02 * w * (d - pl.d);
      pl.n++;
    }
  }

  // ---- Unpredictability: if our shots keep failing against these opponents, mix it up.
  function unpredictability(s) {
    const res = [];
    for (const e of s.enemies || []) res.push(...(brain.vs[e.name] || []));
    if (res.length < 3) return CFG.unpredictBase;
    const rate = res.reduce((a, b) => a + b, 0) / res.length;
    return Math.max(CFG.unpredictBase, Math.min(1, (0.5 - rate) * 2));
  }

  // ---- Aim: at a player or at their net, whichever looks smarter right now.
  //   net:    better when they're far from the net's line / in the air
  //   player: better when one is on the ground, close to the ball's line (hard to dodge)
  //   plus what has worked so far, and some randomness when we're being too predictable.
  function chooseTarget(s, u) {
    const { ball } = s;
    const rate = (k) => (brain.targets[k].wins + 1) / (brain.targets[k].tries + 2);
    const floor = s.floorY ?? s.bounds.maxY - 40;
    const opts = [{ kind: 'net', score: rate('net') }];
    const net = s.enemyGoal;
    const nearNet = s.enemies.some((e) => hyp(e.x - net.x, e.y - net.y) < 120);
    if (!nearNet) opts[0].score += 0.15;
    for (const e of s.enemies) {
      const d = hyp(e.x - ball.x, e.y - ball.y);
      const grounded = floor - e.y < 15;
      let sc = rate('player') + (grounded ? 0.1 : -0.1) + (d < 260 ? 0.1 : -0.05);
      opts.push({ kind: 'player', name: e.name, score: sc });
    }
    for (const o of opts) {
      if (lastTargetFailed && o.kind === lastTargetFailed) o.score -= 0.25; // it just failed: try the other
      o.score += (Math.random() * 2 - 1) * 0.4 * u;
    }
    return opts.reduce((a, b) => (b.score > a.score ? b : a));
  }
  function targetPoint(s, t) {
    if (t && t.kind === 'player') {
      const e = s.enemies.find((q) => q.name === t.name);
      if (e) {
        const tt = Math.min(1, hyp(e.x - s.ball.x, e.y - s.ball.y) / CFG.throwSpeedGuess);
        const floor = s.floorY ?? s.bounds.maxY - 40;
        return { x: Math.max(0, Math.min(BONK_W, e.x + e.vx * tt)), y: Math.min(floor, e.y + e.vy * tt) };
      }
    }
    return s.enemyGoal;
  }

  // ---- Our own shots, recorded input by input so a good one can be replayed smoothly.
  let ownFrames = [];
  function smoothFrames(frames) { // each key is on if it was on in at least 2 of 3 frames
    return frames.map((f, i) => {
      let k = 0;
      for (const bit of [1, 2, 4, 8, 16, 32]) {
        const votes = [frames[i - 1], f, frames[i + 1]].filter((q) => q && (q.k & bit)).length;
        if (votes >= 2 || (votes === 1 && (f.k & bit) && (!frames[i - 1] || !frames[i + 1]))) k |= bit;
      }
      return { k, bx: f.bx, by: f.by };
    });
  }

  function offenseDeath() {
    if (watchThrow) { // their throw killed us: that's a play worth copying
      addPlay(watchThrow.play, 1);
      if (watchThrow.move) addMove(watchThrow.move, 1);
      lastLesson = `copied ${watchThrow.play.from}'s throw: it killed me`;
      watchThrow = null;
    }
    myThrow = null;
    prevBall = null;
  }


  // ---- Grapple meter: grappleMaxMs of use, grappleRecoverMs to refill from empty.
  let fuel = CFG.grappleMaxMs;  // ms of grapple left
  let fuelLocked = false;       // ran dry: no grapple until it's full again
  let fuelT = performance.now();
  function updateFuel(now) {
    const dt = Math.min(200, now - fuelT);
    fuelT = now;
    if ((teach ? userHeld : held).has('grapple')) fuel -= dt;
    else fuel += dt * (CFG.grappleMaxMs / CFG.grappleRecoverMs);
    fuel = Math.max(0, Math.min(CFG.grappleMaxMs, fuel));
    if (fuel <= 0) fuelLocked = true;
    if (fuelLocked && fuel >= CFG.grappleMaxMs) fuelLocked = false;
  }
  const hasFuel = (ms) => !fuelLocked && fuel >= ms;

  // ---- Grapple radar: everything within reach, nearest first. In grapple mode the rope
  // grabs the nearest thing in range, so the bot checks this before every grapple: the
  // ball has to be the nearest thing to grab it, and the ground has to be nearest to jump.
  function radar(s) {
    const { me } = s;
    const r = CFG.playerRadius;
    const out = [];
    const add = (kind, d, extra) => {
      if (d <= CFG.grappleRange) out.push(Object.assign({ kind, d: Math.max(0, d) }, extra));
    };
    if (s.ball) add('ball', hyp(s.ball.x - me.x, s.ball.y - me.y) - (s.ballR || 10), {});
    for (const p of s.players) add('player', hyp(p.x - me.x, p.y - me.y) - r, { name: p.name });
    // Exact distance to every solid piece of the map (surface to surface). A piece counts
    // as 'ground' when its closest point is below us (floor, ramps, the spike), else 'map'
    // (walls, the barrier, platforms beside or above us).
    const exact = !!(s.map && s.map.length);
    for (const sh of solidShapes(s)) {
      const b = sh.box;
      if (me.x < b.x0 - CFG.grappleRange - r || me.x > b.x1 + CFG.grappleRange + r ||
          me.y < b.y0 - CFG.grappleRange - r || me.y > b.y1 + CFG.grappleRange + r) continue;
      const c = shapeDist(sh, me.x, me.y);
      if (!exact && c.d < 0) continue; // (rough boxes only) a box we're inside is several pieces drawn together
      const below = c.y - me.y > Math.abs(c.x - me.x) * 0.7; // closest point is (mostly) under us
      add(below ? 'ground' : 'map', c.d - r, {});
    }
    // Without an exact map, the floor and side walls always count.
    if (!exact) {
      if (s.floorY != null) add('ground', s.floorY - me.y, {});
      add('wall', me.x - s.bounds.minX - r, {});
      add('wall', s.bounds.maxX - me.x - r, {});
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }


  // ==================== THE LEARNING BRAIN (pure machine learning) ====================
  // No plans, no jump knowledge, no dodging rule. A small neural network looks at the game
  // (the ball's position and speed relative to it, its own speed, height, grapple left, whether
  // it's holding the ball, ...) and picks which keys to hold. It learns two ways:
  //   1. by watching: every moment of the good players it sees becomes "in this situation,
  //      they pressed this" - a second network learns to imitate that (behaviour cloning);
  //   2. by doing (reinforcement learning, deep Q-learning): it gets rewards and punishments
  //      for what happens - dying -1, letting a goal in, catching the ball, getting it over,
  //      kickoffs won/lost, being too slow to get the ball, passes - and learns which keys lead
  //      to good outcomes from each situation.
  // It plays with: (what it has learned works) + (what good players would do), plus some
  // exploration. Training runs in a background thread so the game doesn't lag.
  const ML_ACTIONS = [[], ['left'], ['right'], ['grapple'], ['left', 'grapple'], ['right', 'grapple'],
    ['up', 'grapple'], ['up', 'heavy', 'grapple'], ['left', 'up', 'heavy', 'grapple'], ['right', 'up', 'heavy', 'grapple'],
    ['up'], ['down', 'grapple'], ['left', 'up', 'grapple'], ['right', 'up', 'grapple']];
  const ML_NA = ML_ACTIONS.length, ML_IN = 16;

  // ---- the network maths (shared with the background thread) ----
  function mlLib() {
    const H = 64;
    function layer(nIn, nOut) {
      const W = new Float32Array(nIn * nOut), sc = Math.sqrt(2 / nIn);
      for (let i = 0; i < W.length; i++) W[i] = (Math.random() * 2 - 1) * sc;
      return { nIn, nOut, W, b: new Float32Array(nOut), mW: new Float32Array(nIn * nOut), vW: new Float32Array(nIn * nOut),
               mb: new Float32Array(nOut), vb: new Float32Array(nOut) };
    }
    function create(nIn, nOut) { return { L: [layer(nIn, H), layer(H, H), layer(H, nOut)], t: 0 }; }
    function forward(net, x) {
      const acts = [x];
      let a = x;
      for (let li = 0; li < net.L.length; li++) {
        const L = net.L[li], o = new Float32Array(L.nOut), last = li === net.L.length - 1;
        for (let j = 0; j < L.nOut; j++) {
          let sum = L.b[j];
          const off = j * L.nIn;
          for (let i = 0; i < L.nIn; i++) sum += L.W[off + i] * a[i];
          o[j] = last ? sum : (sum > 0 ? sum : 0.01 * sum);
        }
        acts.push(o); a = o;
      }
      return acts;
    }
    const out = (net, x) => { const a = forward(net, x); return a[a.length - 1]; };
    function grads(net) { return net.L.map((L) => ({ W: new Float32Array(L.W.length), b: new Float32Array(L.b.length) })); }
    function backward(net, acts, gOut, G) {
      let g = gOut;
      for (let li = net.L.length - 1; li >= 0; li--) {
        const L = net.L[li], a = acts[li], o = acts[li + 1];
        if (li < net.L.length - 1) for (let j = 0; j < L.nOut; j++) if (o[j] <= 0) g[j] *= 0.01;
        const gIn = new Float32Array(L.nIn);
        for (let j = 0; j < L.nOut; j++) {
          const gj = g[j];
          if (!gj) continue;
          G[li].b[j] += gj;
          const off = j * L.nIn;
          for (let i = 0; i < L.nIn; i++) { G[li].W[off + i] += gj * a[i]; gIn[i] += gj * L.W[off + i]; }
        }
        g = gIn;
      }
    }
    function adam(net, G, lr, n) {
      net.t++;
      const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
      for (let li = 0; li < net.L.length; li++) {
        const L = net.L[li];
        const upd = (P, M, V, Gr) => {
          for (let i = 0; i < P.length; i++) {
            let g = Gr[i] / n; if (g > 1) g = 1; else if (g < -1) g = -1;
            M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g;
            P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8);
          }
        };
        upd(L.W, L.mW, L.vW, G[li].W); upd(L.b, L.mb, L.vb, G[li].b);
      }
    }
    function pack(net) {
      let n = 0; for (const L of net.L) n += L.W.length + L.b.length;
      const a = new Float32Array(n); let k = 0;
      for (const L of net.L) { a.set(L.W, k); k += L.W.length; a.set(L.b, k); k += L.b.length; }
      return a;
    }
    function unpack(net, a) {
      let k = 0;
      for (const L of net.L) { L.W.set(a.subarray(k, k + L.W.length)); k += L.W.length; L.b.set(a.subarray(k, k + L.b.length)); k += L.b.length; }
    }
    // The trainer: experience replay + target network (double DQN) for the Q network, and a
    // weighted cross-entropy imitation network trained on the watched good players.
    function trainer(NIN, NA) {
      const Q = create(NIN, NA), T = create(NIN, NA), P = create(NIN, NA);
      unpack(T, pack(Q));
      const CAP = 40000, REC = NIN * 2 + 4;
      const R = new Float32Array(CAP * REC); let rN = 0, rI = 0;
      const DCAP = 30000, DREC = NIN + 2;
      const D = new Float32Array(DCAP * DREC); let dN = 0, dI = 0;
      let updates = 0, pUpdates = 0, lossQ = 0, lossP = 0;
      const addT = (arr) => { for (let k = 0; k + REC <= arr.length; k += REC) { R.set(arr.subarray(k, k + REC), rI * REC); rI = (rI + 1) % CAP; rN = Math.min(CAP, rN + 1); } };
      const addD = (arr) => { for (let k = 0; k + DREC <= arr.length; k += DREC) { D.set(arr.subarray(k, k + DREC), dI * DREC); dI = (dI + 1) % DCAP; dN = Math.min(DCAP, dN + 1); } };
      function stepQ(B, lr) {
        const G = grads(Q);
        let l = 0;
        for (let b = 0; b < B; b++) {
          const o = Math.floor(Math.random() * rN) * REC;
          const s = R.subarray(o, o + NIN), a = R[o + NIN], r = R[o + NIN + 1], s2 = R.subarray(o + NIN + 2, o + NIN * 2 + 2);
          const gam = R[o + NIN * 2 + 2], done = R[o + NIN * 2 + 3];
          let target = r;
          if (!done) {
            const q2 = out(Q, s2); let best = 0; for (let i = 1; i < NA; i++) if (q2[i] > q2[best]) best = i;
            target += gam * out(T, s2)[best];
          }
          if (target > 3) target = 3; else if (target < -3) target = -3; // keeps it from running away
          const acts = forward(Q, s), q = acts[acts.length - 1];
          let err = q[a] - target; l += err * err;
          if (err > 1) err = 1; else if (err < -1) err = -1;
          const g = new Float32Array(NA); g[a] = err;
          backward(Q, acts, g, G);
        }
        adam(Q, G, lr, B);
        updates++; lossQ = 0.98 * lossQ + 0.02 * (l / B);
        if (updates % 500 === 0) unpack(T, pack(Q));
      }
      function stepP(B, lr) {
        const G = grads(P);
        let l = 0;
        for (let b = 0; b < B; b++) {
          const o = Math.floor(Math.random() * dN) * DREC;
          const s = D.subarray(o, o + NIN), a = D[o + NIN], w = D[o + NIN + 1];
          const acts = forward(P, s), z = acts[acts.length - 1];
          let m = -Infinity; for (let i = 0; i < NA; i++) m = Math.max(m, z[i]);
          let sum = 0; const p = new Float32Array(NA);
          for (let i = 0; i < NA; i++) { p[i] = Math.exp(z[i] - m); sum += p[i]; }
          const g = new Float32Array(NA);
          for (let i = 0; i < NA; i++) { p[i] /= sum; g[i] = (p[i] - (i === a ? 1 : 0)) * w; }
          l -= Math.log(p[a] + 1e-9);
          backward(P, acts, g, G);
        }
        adam(P, G, lr, B);
        pUpdates++; lossP = 0.98 * lossP + 0.02 * (l / B);
      }
      function train(k) {
        for (let i = 0; i < k; i++) {
          if (rN > 300) stepQ(32, 0.0003);
          if (dN > 200) stepP(32, 0.001);
        }
      }
      return { Q, P, addT, addD, train, pack, unpack,
               stats: () => ({ updates, pUpdates, lossQ, lossP, replay: rN, demos: dN }) };
    }
    return { create, forward, out, pack, unpack, trainer };
  }

  // ---- the background thread (falls back to light training on the main thread) ----
  const ML = { lib: mlLib(), Q: null, P: null, worker: null, local: null, inbox: [], demoBox: [], win: [],
               last: null, reward: 0, hold: null, lastAt: 0, sendAt: 0, saveAt: 0, rewardAvg: 0, stats: {} };
  function mlInit() {
    const L = ML.lib;
    ML.Q = L.create(ML_IN, ML_NA); ML.P = L.create(ML_IN, ML_NA);
    const saved = brain.ml || {};
    const load = (net, b64) => { try { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); L.unpack(net, new Float32Array(u.buffer)); } catch (e) { /* fresh */ } };
    if (saved.q) load(ML.Q, saved.q);
    if (saved.p) load(ML.P, saved.p);
    const src = `const lib=(${mlLib.toString()})(); const tr=lib.trainer(${ML_IN},${ML_NA});
      onmessage=(e)=>{const m=e.data; if(m.type==='load'){ if(m.q) tr.unpack(tr.Q,m.q); if(m.p) tr.unpack(tr.P,m.p); }
        if(m.type==='data'){ lastData=Date.now(); if(m.t) tr.addT(m.t); if(m.d) tr.addD(m.d); } };
      let lastSend=0, lastData=0; function loop(){ const now=Date.now();
        if(now-lastData>5000){ setTimeout(loop, 500); return; } // bot off / nothing new: rest
        tr.train(${CFG.mlTrainPerTick});
        if(now-lastSend>1000){ lastSend=now; postMessage({q:tr.pack(tr.Q), p:tr.pack(tr.P), stats:tr.stats()}); }
        setTimeout(loop, ${CFG.mlTrainPauseMs}); } loop();`;
    try {
      if (CFG.mlWorker && typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined') {
        ML.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        ML.worker.onmessage = (e) => { L.unpack(ML.Q, e.data.q); L.unpack(ML.P, e.data.p); ML.stats = e.data.stats; };
        ML.worker.onerror = () => { ML.worker = null; mlLocal(); };
        ML.worker.postMessage({ type: 'load', q: L.pack(ML.Q), p: L.pack(ML.P) });
      } else mlLocal();
    } catch (e) { ML.worker = null; mlLocal(); }
  }
  function mlLocal() { // no background thread: train lightly here
    if (ML.local) return;
    ML.local = ML.lib.trainer(ML_IN, ML_NA);
    ML.local.unpack(ML.local.Q, ML.lib.pack(ML.Q)); ML.local.unpack(ML.local.P, ML.lib.pack(ML.P));
  }
  function mlSave() {
    const enc = (net) => { const u = new Uint8Array(ML.lib.pack(net).buffer); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
    brain.ml = Object.assign(brain.ml || {}, { q: enc(ML.Q), p: enc(ML.P) });
  }

  // ---- what it sees (everything in the left-side frame, so red and blue learn as one) ----
  function mlFeatures(s, me, vx, vy, side, onFloor, holding, fuelMs) {
    const f = new Float32Array(ML_IN), b = s.ball;
    const m = side === 'right' ? -1 : 1, floor = s.floorY ?? s.bounds.maxY;
    f[4] = vx * m / 300; f[5] = vy / 400; f[6] = onFloor ? 1 : 0; f[7] = holding ? 1 : 0; f[8] = fuelMs / 5000;
    f[9] = (s.midX - me.x) * m / 365; f[12] = (floor - me.y) / 150; f[11] = s.kickoff || kickContest(s) ? 1 : 0;
    if (b) {
      const dx = b.x - me.x, dy = b.y - me.y, d = Math.hypot(dx, dy);
      f[0] = dx * m / 200; f[1] = dy / 200; f[2] = b.vx * m / 400; f[3] = b.vy / 400;
      const ours = side === 'left' ? b.x < s.midX - CFG.centerMargin : b.x > s.midX + CFG.centerMargin;
      const theirs = side === 'left' ? b.x > s.midX + CFG.centerMargin : b.x < s.midX - CFG.centerMargin;
      f[10] = ours ? 1 : theirs ? -1 : 0; f[13] = (floor - b.y) / 200;
      f[14] = d - (s.ballR || 10) <= CFG.grappleRange && d - (s.ballR || 10) < floor - me.y ? 1 : 0; // the grapple would take the ball
      f[15] = d / 300;
    }
    return f;
  }
  const mlActionOf = (k) => { // a watched player's keys -> one of our key choices
    if (k.g && k.u && k.h) return k.l ? 8 : k.r ? 9 : 7;
    if (k.g && k.u) return k.l ? 12 : k.r ? 13 : 6;
    if (k.g && k.d) return 11;
    if (k.g) return k.l ? 4 : k.r ? 5 : 3;
    if (k.u) return 10;
    return k.l ? 1 : k.r ? 2 : 0;
  };
  function mlReward(r) { if (CFG.ml || teach) ML.reward += r; }

  // ---- learning from watching: good players' moments -> imitation samples ----
  let mlDemoTick = 0;
  function mlWatch(s, now) {
    if ((mlDemoTick = (mlDemoTick + 1) % 2)) return; // every other step is plenty
    const floor = s.floorY ?? s.bounds.maxY;
    for (const e of s.players) {
      const o = oppTrack.get(e.name);
      if (!o || !o.last) continue;
      const w = skillOf(e.name);
      if (w < 0.45) continue;
      const k = e.side === 'right' ? Object.assign({}, o.last, { l: o.last.r, r: o.last.l }) : o.last;
      const holding = !!(o.holdAt && now - o.holdAt < 100);
      const f = mlFeatures(s, e, e.vx, e.vy, e.side, floor - e.y < CFG.floorNear + 2, holding, o.fuel ?? CFG.grappleMaxMs);
      for (let i = 0; i < ML_IN; i++) ML.demoBox.push(f[i]);
      ML.demoBox.push(mlActionOf(k), w);
    }
  }

  // ---- one decision ----
  function mlDecide(s, now) {
    const me = s.me, ball = s.ball, floor = s.floorY ?? s.bounds.maxY;
    const onFloor = me.y >= floor - CFG.floorNear;
    const pressing = !!ML.prevG;          // was the grapple held last step (ours, or yours when teaching)
    const holding = !!ML.hold;
    const mir = s.side === 'right';
    const f = mlFeatures(s, me, me.vx, me.vy, s.side, onFloor, holding, fuel);
    const d = ball ? Math.hypot(ball.x - me.x, ball.y - me.y) : Infinity;
    ML.lastBallD = d;

    // Before the round starts (the countdown) nothing it does counts: it waits. If it's going to
    // replay a kickoff it was taught, it holds that kickoff's first keys, so it goes the instant
    // the round begins (bonk drops keys pressed during the countdown, so they're re-pressed).
    if (!ML.live) {
      ML.last = null; ML.win = []; ML.reward = 0; ML.prevG = false; ML.grabTry = null; ML.hold = null;
      if (mode === 'THROW') setMode('ML');
      if (teach) { decision = 'waiting for the round to start (you have control)'; return new Set(); }
      if (!ML.replay && s.kickoff) ML.replay = mlPickKickoff(f);
      decision = `waiting for the countdown to end${ML.replay ? ' - then replaying a kickoff you taught me' : ''}`;
      return ML.replay ? mlKeysFromBits(ML.replay.clip.keys.length && ML.replay.clip.keys[0][0] < 60 ? ML.replay.clip.keys[0][1] : 0, mir) : new Set();
    }

    // learn from the step that just happened (n-step returns)
    if (ML.last) { ML.win.push({ s: ML.last.s, a: ML.last.a, r: ML.reward }); ML.rewardAvg = 0.999 * ML.rewardAvg + 0.001 * ML.reward; }
    ML.reward = 0;
    mlEmit(f, false);

    const steps = (brain.ml && brain.ml.steps) || 0;
    const eps = Math.max(CFG.mlEpsMin, CFG.mlEps * Math.pow(0.5, steps / CFG.mlEpsHalfLife));
    ML.eps = eps;
    let a = 0, keys = null, why = '';
    if (teach) {
      // TEACHING: you're playing. Your keys are the answer for this situation: they go to the
      // imitation network (counted extra), to its own experience (with the rewards your play
      // earns), and onto the tape that taught moves are cut from.
      keys = new Set(userHeld);
      const kb = mlBitsFromKeys(keys, mir);
      a = mlActionOf(mlBitsObj(kb));
      for (let i = 0; i < ML_IN; i++) ML.demoBox.push(f[i]);
      ML.demoBox.push(a, CFG.teachWeight);
      mlTape(s, f, kb, now);
      why = 'watching you';
    } else {
      if (ML.replay && !ML.replay.startAt) ML.replay.startAt = now; // a kickoff waiting for the round: go
      if (!ML.replay && now - (ML.clipCheckAt || 0) > 100) { ML.clipCheckAt = now; ML.replay = mlPickPlay(f, now); }
      if (ML.replay) {
        const r = mlReplayStep(s, now);
        if (r) { keys = r.keys; a = mlActionOf(mlBitsObj(r.bits)); why = `replaying a move you taught (${((now - ML.replay.startAt) / 1000).toFixed(1)}s)`; }
      }
    }
    if (!keys) {
      // choose: what's been learned to work + what good players would do + some exploration
      const q = ML.lib.out(ML.Q, f), z = ML.lib.out(ML.P, f);
      let mz = -Infinity; for (let i = 0; i < ML_NA; i++) mz = Math.max(mz, z[i]);
      let sz = 0; const pi = new Float32Array(ML_NA);
      for (let i = 0; i < ML_NA; i++) { pi[i] = Math.exp(z[i] - mz); sz += pi[i]; }
      for (let i = 0; i < ML_NA; i++) pi[i] /= sz;
      const beta = CFG.mlImitate * ((ML.stats.demos || 0) > 200 ? 1 : 0);
      if (ML.explore && ML.explore.left > 0) { a = ML.explore.a; ML.explore.left--; } // finishing a try (a few steps, so it actually does something)
      else if (Math.random() < eps / 4) { // explore: mostly the way a good player might, sometimes anything
        if (beta > 0 && Math.random() < 0.7) { let r = Math.random(); a = 0; while (a < ML_NA - 1 && (r -= pi[a]) > 0) a++; }
        else a = Math.floor(Math.random() * ML_NA);
        ML.explore = { a, left: 2 + Math.floor(Math.random() * 6) };
      } else {
        let best = -Infinity;
        for (let i = 0; i < ML_NA; i++) { const v = q[i] + beta * Math.log(pi[i] + 1e-6); if (v > best) { best = v; a = i; } }
      }
      keys = new Set();
      for (const k of ML_ACTIONS[a]) keys.add(mir && k === 'left' ? 'right' : mir && k === 'right' ? 'left' : k);
      why = 'learning';
    }
    ML.last = { s: f, a };
    brain.ml = brain.ml || {}; brain.ml.steps = steps + 1;

    // Is the rope on the ball? (pressed the grapple while the ball was the nearest thing in reach;
    // then, while we or the ball move, it stays the same distance away = it's on the rope)
    if (keys.has('grapple') && !pressing) ML.grabTry = { nearest: f[14] > 0 && !!ball, d, at: now, mx: me.x, my: me.y, bx: ball ? ball.x : 0, by: ball ? ball.y : 0, ok: false };
    if (!keys.has('grapple')) ML.grabTry = null;
    ML.prevG = keys.has('grapple');
    const gt = ML.grabTry;
    if (gt && gt.nearest && ball) {
      if (Math.abs(d - gt.d) > (gt.ok ? 30 : 18)) { gt.nearest = false; gt.ok = false; } // pulled away: not on the rope
      else if (!gt.ok && now - gt.at >= 120 && Math.hypot(me.x - gt.mx, me.y - gt.my) + Math.hypot(ball.x - gt.bx, ball.y - gt.by) > 15) gt.ok = true;
    }
    const wasHolding = !!ML.hold;
    ML.hold = gt && gt.nearest && gt.ok && ball ? gt : null;
    if (ML.hold && !wasHolding) { // caught it
      setMode('THROW');
      grabInfo = { at: now, save: !!(s.ballInfo && s.ballInfo.towardOurNet) };
      if (!grabInfo.save) lastOffenseAt = now;
      if (now - lastReleaseAt > 2000) mlReward(grabInfo.save ? CFG.mlRewardCatchSave : CFG.mlRewardCatch); // (not for re-grabbing its own throw)
    }
    if (!ML.hold && wasHolding) { // let go: a throw - its outcome is judged and rewarded later
      setMode('ML');
      lastReleaseAt = now; lastReleaseTarget = 'net';
      if (ball) myThrow = { at: now, enemies: s.enemies.length, move: null, holdMs: now - grabInfo.at,
        enemyNames: s.enemies.map((e) => e.name), target: 'net',
        play: { source: 'mine', dist: Math.abs(me.x - s.midX), height: floor - me.y,
                angle: Math.atan2(ball.vy, ball.vx * fwdSign(s.side)), speed: Math.hypot(ball.vx, ball.vy), airborne: !onFloor } };
    }
    if (mode !== 'THROW') setMode('ML');
    const names = [...keys].sort();
    decision = `${why}: ${names.join('+') || 'nothing'}${ML.hold ? ' (holding the ball)' : ''}`;
    mlFlush(now);
    return keys;
  }

  // ==================== TEACHING (F3) and taught moves ====================
  // Keys as a small number, in the left-side frame (so a move taught on red works on blue).
  const mlBitsFromKeys = (keys, mir) => (keys.has(mir ? 'right' : 'left') ? 1 : 0) | (keys.has(mir ? 'left' : 'right') ? 2 : 0) |
    (keys.has('up') ? 4 : 0) | (keys.has('down') ? 8 : 0) | (keys.has('grapple') ? 16 : 0) | (keys.has('heavy') ? 32 : 0);
  const mlBitsObj = (b) => ({ l: !!(b & 1), r: !!(b & 2), u: !!(b & 4), d: !!(b & 8), g: !!(b & 16), h: !!(b & 32) });
  function mlKeysFromBits(b, mir) {
    const k = new Set();
    if (b & 1) k.add(mir ? 'right' : 'left');
    if (b & 2) k.add(mir ? 'left' : 'right');
    if (b & 4) k.add('up'); if (b & 8) k.add('down'); if (b & 16) k.add('grapple'); if (b & 32) k.add('heavy');
    return k;
  }
  const clips = () => (brain.clips = Array.isArray(brain.clips) ? brain.clips : []);
  // The tape: the last few seconds of what you pressed and where the ball was, every step.
  function mlTape(s, f, kb, now) {
    const T = ML.tape || (ML.tape = []);
    const m = s.side === 'right' ? -1 : 1;
    const prev = T[T.length - 1];
    if (kb && (!prev || !prev.k) && now - (ML.lastKeysAt || 0) > CFG.teachIdleMs) ML.idleEndAt = now; // started a new action after a pause
    if (kb) ML.lastKeysAt = now;
    T.push({ t: now, k: kb, bx: s.ball ? (s.ball.x - s.me.x) * m : 0, by: s.ball ? s.ball.y - s.me.y : 0, f: Array.from(f, (v) => Math.round(v * 100) / 100) });
    while (T.length && now - T[0].t > CFG.clipMaxMs + 2000) T.shift();
  }
  // Something was judged (a save, a shot, a kickoff, a pass, too slow, a death).
  function mlVerdict(kind, good) {
    const now = performance.now();
    // a taught move that was being replayed (or just finished) gets the credit or the blame
    const run = ML.replay && ML.replay.startAt ? { clip: ML.replay.clip } : ML.clipRun && now - ML.clipRun.endAt < CFG.clipCreditMs ? ML.clipRun : null;
    if (run && !teach) {
      const c = run.clip;
      c.n = (c.n || 0) + 1; c.score += 0.35 * ((good ? 1 : 0) - c.score);
      if (good) c.wins = (c.wins || 0) + 1;
      ML.clipRun = null;
      if (!good && ML.replay) ML.replay = null;
      lastLesson = `taught move (${c.kind === 'kick' ? 'kickoff' : 'play'}) ${good ? 'worked' : 'failed'}: ${kind} - now ${Math.round(c.score * 100)}%`;
    }
    if (teach && kind !== 'death' && kind !== 'slow') mlSaveClip(kind, good, now);
  }
  // Cut the move you just made off the tape and keep it.
  function mlSaveClip(kind, good, now) {
    const T = ML.tape || [];
    if (T.length < 3) return;
    const kick = kind === 'Kickoffs';
    let end = now;
    if (kind === 'Shots' && now - lastReleaseAt < 4000) end = Math.min(now, lastReleaseAt + 300); // a throw ends just after the release
    let start = Math.max(end - (kick ? CFG.clipMaxMs + 2000 : CFG.clipMaxMs), ML.liveAt || 0, ML.cutAt || 0, T[0].t);
    if (!kick) {
      if ((ML.ballArrivedAt || 0) < end - 300) start = Math.max(start, (ML.ballArrivedAt || 0) - 300);
      if ((ML.idleEndAt || 0) < end - 300) start = Math.max(start, ML.idleEndAt || 0);
    }
    const seg = T.filter((e) => e.t >= start && e.t <= end);
    ML.cutAt = end;
    if (seg.length < 3 || !seg.some((e) => e.k)) return;
    const t0 = seg[0].t, keys = [], path = [];
    let lastK = -1, lastP = -1e9;
    for (const e of seg) {
      if (e.k !== lastK) { keys.push([Math.round(e.t - t0), e.k]); lastK = e.k; }
      if (e.t - lastP >= 100) { path.push([Math.round(e.t - t0), Math.round(e.bx), Math.round(e.by)]); lastP = e.t; }
    }
    const C = clips();
    C.push({ kind: kick ? 'kick' : 'play', why: kind, good, f0: seg[0].f, keys, path, dur: Math.round(end - t0),
             score: good ? 1 : 0.15, n: 0, wins: 0, at: Date.now() });
    if (C.length > CFG.clipMax) { // full: forget the worst (oldest first among equals)
      let worst = 0;
      for (let i = 1; i < C.length; i++) if (C[i].score < C[worst].score || (C[i].score === C[worst].score && C[i].at < C[worst].at)) worst = i;
      C.splice(worst, 1);
    }
    lastLesson = `memorized your ${kick ? 'kickoff' : kind === 'Saves' ? 'save' : kind === 'Shots' ? 'shot' : 'pass'} ` +
                 `(${good ? 'it worked' : "it didn't work"}, ${(end - t0) / 1000 | 0}.${Math.round((end - t0) % 1000 / 100)}s, ${keys.length} key changes) - ${C.length} moves memorized`;
    saveBrain();
  }
  const CLIP_W = [3, 3, 1.5, 1.5, 0.7, 0.7, 1, 3, 0.3, 1, 1, 3, 1, 1, 0.5, 0.5];
  function clipDist(f, f0) {
    let d = 0;
    for (let i = 0; i < ML_IN; i++) { const x = f[i] - (f0[i] || 0); d += CLIP_W[i] * x * x; }
    return Math.sqrt(d);
  }
  function mlPickKickoff(f) { // countdown: the taught kickoff that started most like this one
    let best = null;
    for (const c of clips()) {
      if (c.kind !== 'kick' || c.score < CFG.clipMinScore) continue;
      const d = clipDist(f, c.f0) - c.score * 0.5;
      if (clipDist(f, c.f0) < CFG.clipMatchKick && (!best || d < best.d)) best = { d, c };
    }
    if (!best || Math.random() > CFG.clipUse) return null;
    best.c.uses = (best.c.uses || 0) + 1;
    return { clip: best.c, startAt: null };
  }
  function mlPickPlay(f, now) { // mid-round: a taught move that started in a situation like this one
    let best = null;
    for (const c of clips()) {
      if (c.kind !== 'play' || c.score < CFG.clipMinScore) continue;
      const dd = clipDist(f, c.f0);
      if (dd < CFG.clipMatch && (!best || dd - c.score * 0.3 < best.d)) best = { d: dd - c.score * 0.3, c };
    }
    if (!best || Math.random() > CFG.clipUse * best.c.score) return null;
    best.c.uses = (best.c.uses || 0) + 1;
    return { clip: best.c, startAt: now };
  }
  // One step of a replay: the keys you held at this moment of the move. If the ball isn't
  // where it was when you did it, the move doesn't fit any more: stop and think again.
  function mlReplayStep(s, now) {
    const R = ML.replay, c = R.clip, t = now - R.startAt;
    if (t > c.dur) { ML.clipRun = { clip: c, endAt: now }; ML.replay = null; return null; }
    if (s.ball && c.path.length && t > 200) {
      let p = c.path[0];
      for (const q of c.path) { if (q[0] > t) break; p = q; }
      const m = s.side === 'right' ? -1 : 1;
      const dx = (s.ball.x - s.me.x) * m - p[1], dy = s.ball.y - s.me.y - p[2];
      if (Math.hypot(dx, dy) > CFG.clipDiverge) { ML.clipRun = { clip: c, endAt: now }; ML.replay = null; return null; }
    }
    let b = 0;
    for (const k of c.keys) { if (k[0] > t) break; b = k[1]; }
    return { bits: b, keys: mlKeysFromBits(b, s.side === 'right') };
  }
  // Has the round actually started? After a reset (a new round, or coming back to life) bonk
  // counts down with everyone frozen. It's live once anything moves (anyone, or the ball), or
  // when the countdown has run as long as it usually does (it learns how long that is).
  function mlRoundLive(s, now) {
    const RD = ML.rd || (ML.rd = { live: false, resetAt: now, snap: new Map(), prevMe: null, prevKick: false, alive: false });
    const me = s.me;
    const teleport = RD.prevMe && Math.hypot(me.x - RD.prevMe.x, me.y - RD.prevMe.y) > 80;
    if (!RD.alive || (s.kickoff && !RD.prevKick) || teleport) {
      if (ML.last && RD.alive) mlTerminal(0); // the round ended with us still alive
      RD.live = false; RD.resetAt = now; RD.snap = new Map();
      ML.replay = null; ML.clipRun = null;
    }
    RD.prevMe = { x: me.x, y: me.y }; RD.prevKick = !!s.kickoff; RD.alive = true;
    if (!RD.live) {
      const el = now - RD.resetAt;
      const pos = [['', me], ...s.players.map((p) => [p.name, p])];
      if (s.ball) pos.push([' ball', s.ball]);
      let moved = false;
      for (const [n, p] of pos) {
        const q = RD.snap.get(n);
        if (!q || el < 150) RD.snap.set(n, { x: p.x, y: p.y });
        else if (Math.hypot(p.x - q.x, p.y - q.y) > 3) moved = true;
      }
      if (moved) {
        RD.live = true;
        if (el > 500 && el < 6000) brain.countdownMs = brain.countdownMs == null ? el : brain.countdownMs + 0.3 * (el - brain.countdownMs);
      } else if (el > (brain.countdownMs ?? CFG.countdownMs) + 400) RD.live = true;
      if (RD.live) ML.liveAt = now;
    }
    // when the ball comes over to our side (where a taught move usually starts)
    const ours = s.ball && onOurSide(s, s.ball.x);
    if (ours && !RD.ballOurs) ML.ballArrivedAt = now;
    RD.ballOurs = !!ours;
    return RD.live;
  }
  // turn the recent steps into n-step learning samples
  function mlEmit(f, done) {
    const n = CFG.mlNStep, g = CFG.mlGamma;
    const out = (k) => {
      let R = 0, gam = 1;
      for (let i = 0; i < k; i++) { R += gam * ML.win[i].r; gam *= g; }
      const w0 = ML.win[0];
      for (let i = 0; i < ML_IN; i++) ML.inbox.push(w0.s[i]);
      ML.inbox.push(w0.a, R);
      for (let i = 0; i < ML_IN; i++) ML.inbox.push(f ? f[i] : 0);
      ML.inbox.push(gam, done ? 1 : 0);
      ML.win.shift();
    };
    if (done) { while (ML.win.length) out(ML.win.length); }
    else if (ML.win.length >= n) out(n);
  }
  function mlTerminal(r) { // died (or the round ended on us): the last step gets the final reward
    if (!ML.last) return;
    ML.win.push({ s: ML.last.s, a: ML.last.a, r: ML.reward + r });
    ML.reward = 0; ML.last = null; ML.hold = null; ML.grabTry = null;
    mlEmit(null, true);
  }
  function mlFlush(now) {
    if (now - ML.sendAt < 250) return;
    ML.sendAt = now;
    const t = new Float32Array(ML.inbox), d = new Float32Array(ML.demoBox);
    ML.inbox = []; ML.demoBox = [];
    if (ML.worker) ML.worker.postMessage({ type: 'data', t, d }, [t.buffer, d.buffer]);
    else if (ML.local) {
      ML.local.addT(t); ML.local.addD(d);
      ML.local.train(CFG.mlLocalTrain);
      ML.lib.unpack(ML.Q, ML.local.pack(ML.local.Q)); ML.lib.unpack(ML.P, ML.local.pack(ML.local.P));
      ML.stats = ML.local.stats();
    }
    if (now - ML.saveAt > CFG.saveEveryMs) { ML.saveAt = now; saveBrain(); }
  }
  function mlRestart() { // after Forget or Import: fresh networks from whatever the brain holds now
    if (ML.worker) { try { ML.worker.terminate(); } catch (e) { /* ignore */ } ML.worker = null; }
    ML.local = null; ML.inbox = []; ML.demoBox = []; ML.win = []; ML.last = null; ML.reward = 0;
    ML.hold = null; ML.grabTry = null; ML.stats = {};
    mlInit();
  }

  // One step of the learning brain: run the self-review and the watchers (they hand out the
  // rewards), learn from the good players on screen, pick keys, show the panel now and then.
  function mlTick(s, now) {
    if (!ML.Q) mlInit();
    ML.live = mlRoundLive(s, now);
    readOpponentInputs(s, now);
    offenseTick(s, now);
    watchTeammateThrows(s, now);
    watchDefense(s, now);
    watchKickoffs(s, now);
    watchDeaths(s);
    watchPositions(s, now);
    watchPasses(s, now);
    passTick(s, now);
    grabClockTick(s, now);
    reviewTick(s, now);
    kickoffTick(s, now);
    curS = s;
    mlWatch(s, now);
    if (s.ball) {
      const depth = (s.ball.x - s.midX) * fwdSign(s.side);
      if (Math.abs(depth) > CFG.centerMargin) mlReward(depth > 0 ? CFG.mlRewardTerritory : -CFG.mlRewardTerritory);
    }
    const keys = mlDecide(s, now);
    if (teach) { if (held.size) releaseAll(); } // you're playing: hands off
    else {
      if (keys.has('grapple') && fuelLocked) keys.delete('grapple');
      setKeys(keys);
      // around the countdown, re-press held keys often, so a held kickoff start isn't lost
      refreshKeys(now, !ML.live || now - (ML.liveAt || 0) < 600 ? 50 : CFG.keyRefreshMs);
    }
    if (renderDue(now)) render(mlPanel(s));
  }
  function mlPanel(s) {
    const C = clips(), kicks = C.filter((c) => c.kind === 'kick').length;
    const line1 = teach
      ? `TEACHING (${CFG.teachKey} to stop) - you play, I memorize: ${C.length} moves (${kicks} kickoffs)${ML.live ? '' : ' | countdown'}`
      : `${mode === 'THROW' ? 'HOLDING' : 'PLAYING'} - ${decision}`;
    if (!CFG.panelFull) return line1;
    const st = ML.stats || {}, steps = (brain.ml && brain.ml.steps) || 0;
    return `${line1}\n` +
      `learning brain: ${steps} decisions made, ${st.updates || 0} lessons from its own play (memory ${st.replay || 0} moments), ` +
      `${st.pUpdates || 0} lessons from watching (${st.demos || 0} moments of good players and you)\n` +
      `exploring ${Math.round((ML.eps || 0) * 100)}% of the time  |  imitation ${CFG.mlImitate}  |  ` +
      `training: ${ML.worker ? 'background thread (no lag)' : 'light, in the game thread'}  |  ` +
      `error ${(st.lossQ || 0).toFixed(3)} / ${(st.lossP || 0).toFixed(2)}  |  avg reward ${(ML.rewardAvg * 1000).toFixed(2)}/1000 steps\n` +
      `grapple: ${meterText()}  me (${r0(s.me.x)}, ${r0(s.me.y)}) side ${s.side}  ball ${s.ball ? `(${r0(s.ball.x)}, ${r0(s.ball.y)})` : '-'}\n` +
      `players (imitated most: the best): ${Object.entries(brain.skill).filter(([, r]) => r.g + r.b >= 2)
        .sort((a, b) => skillOf(b[0]) - skillOf(a[0])).slice(0, 4)
        .map(([n, r]) => `${n} ${Math.round(skillOf(n) * 100)}% (${r.g + r.b})`).join(', ') || 'rating them as it watches'}\n` +
      `self-review: ${reviewText()}\n` +
      `keys (${bindSource}): ${bindsText()}\n` +
      `taught moves (${CFG.teachKey}): ${C.length} memorized, ${kicks} kickoffs | ` +
      `${C.filter((c) => c.score >= CFG.clipMinScore).length} in use | replays worked ${C.reduce((n, c) => n + (c.wins || 0), 0)}/${C.reduce((n, c) => n + (c.n || 0), 0)}` +
      ` | countdown ${((brain.countdownMs ?? CFG.countdownMs) / 1000).toFixed(1)}s${ML.live ? '' : ' (waiting for it)'}\n` +
      `last lesson: ${lastLesson || '-'}\n` +
      `speed: ${fps.bot} decisions/s${fps.game ? `, game ${fps.game} fps` : ''}`;
  }

  function decide(s) {
    curS = s;
    const now = performance.now();
    const keys = new Set();
    const { me, ball } = s;
    curG = s.gravity || 0;
    const rad = (lastRadar = radar(s));
    const nearest = rad[0] || null;
    // The grapple latches onto the nearest thing in reach, so the ball only counts as
    // grabbable when it's clearly closer than everything else (ground, walls, map, players).
    const ballNearest = !!nearest && nearest.kind === 'ball' &&
                        (rad.length < 2 || rad[1].d - nearest.d >= CFG.nearestMargin);

    const groundNearest = !!nearest && nearest.kind === 'ground';
    const groundHere = groundAt(s, me.x, me.y);            // the real ground under us (ramps too)
    const onFloor = groundHere != null && me.y >= groundHere - CFG.floorNear;
    const rested = now - lastJumpEnd > CFG.jumpCooldownMs;
    const home = waitSpot(s);
    const r = CFG.playerRadius;
    if (mode !== 'JUMP' && mode !== 'THROW' && mode !== 'SETUP') decision = '';

    // Hold a spot by balancing: aim for a speed that shrinks as we get closer, and tap
    // left/right whenever our actual speed is off. This cancels sliding momentum, so the
    // bot jitters in place instead of drifting.
    const balanceTo = (x, maxV) => {
      const err = x - me.x;
      if (Math.abs(err) <= CFG.balanceDeadzone && Math.abs(me.vx) <= CFG.balanceBand) return keys;
      const want = Math.max(-maxV, Math.min(maxV, err * CFG.balanceGain));
      const dv = want - me.vx;
      if (dv > CFG.balanceBand) keys.add('right');
      else if (dv < -CFG.balanceBand) keys.add('left');
      return keys;
    };
    // Walk toward x, kept inside our half; stand still once there.
    const moveTo = (x, tol = CFG.standStill) => {
      const limit = s.side === 'left' ? s.midX - CFG.wallMargin : s.midX + CFG.wallMargin;
      x = s.side === 'left' ? Math.max(s.bounds.minX + CFG.backWallGap, Math.min(x, limit))
                            : Math.min(s.bounds.maxX - CFG.backWallGap, Math.max(x, limit));
      if (x < me.x - tol) keys.add('left');
      else if (x > me.x + tol) keys.add('right');
      return keys;
    };
    const startJump = (type, dir, grab, label, bucket) => {
      const J = JUMP_TYPES[type];
      if (label === 'pickup' || label === 'setup') lastOffenseAt = now;
      jump = { type, dir, grab, label, boostMs: J.boostMs(), up: J.up, heavy: J.heavy };
      jumpTrack = { type, start: now, startY: me.y, minY: me.y, grabbed: false, dir, vx0: me.vx };
      if (bucket) pending = { bucket, type, at: now };
      setMode('JUMP');
      keys.add('grapple');
      if (J.up) keys.add('up');
      if (J.heavy) keys.add('heavy');
      if (dir) keys.add(dir);
      return keys;
    };
    // Jump high enough to rise needH, using the learned choice for this kind of shot.
    // Returns null (no jump) if every jump would carry us into the ball.
    const smartJump = (needH, dir, grab, label) => {
      const bucket = bucketFor(needH, ball);
      const type = chooseJump(needH, bucket, s, dir);
      if (!type) return null;
      decision += ` [${type} jump]`;
      return startJump(type, dir, grab, label, bucket);
    };
    const jumpFuel = (type) => JUMP_TYPES[type].boostMs() + CFG.carryMinMs;
    // Carry out a save plan: the jump, plus the air move (tap / balloon / balloon-super).
    const doSavePlan = (plan) => {
      setMode('DEFEND');
      const how = { plain: '', boost: ' + grapple tap at the top', balloon: ' + balloon at the top', bsuper: ' + balloon, then super jump' }[plan.style];
      decision = `save plan (${plan.kind}): ${plan.type} jump ${plan.dir || 'straight up'}${how}, then grab it`;
      lastSave = { kind: plan.kind, type: plan.type, dir: plan.dir, at: now, key: plan.key, sig: planSig(plan) };
      const out = startJump(plan.type, plan.dir, true, 'save', 'save:' + plan.kind.replace(/-(bounce|air)$/, ''));
      jump.style = plan.style; jump.air = { phase: 'rise' };
      if (plan.style !== 'plain') { // count the try (even if it never gets measured)
        const m = brain.airMoves[plan.style === 'bsuper' ? 'super' : plan.style === 'balloon' ? 'balloonVy' : 'boost'];
        m.tries = (m.tries || 0) + 1;
      }
      return out;
    };
    // Grabbed the ball: throw it at their net, or to our back wall for the set-up play.
    const startThrow = (how) => {
      if (jumpTrack && !jumpTrack.grabbed) {
        jumpTrack.grabbed = true;
        jumpTrack.pastPeak = me.vy > 0 && !!jumpTrack.liftAt; // already coming down
        jumpTrack.minY = Math.min(jumpTrack.minY, me.y);
        jumpTrack.frozenMinY = jumpTrack.minY;
      }
      if (!CFG.offense) how = 'backwall'; // no offense yet: every grab gets cleared to our back wall
      throwTarget = how;
      kickoffThrow = !!s.kickoff || kickContest(s); // a kickoff grab: drag it to our side
      grabCheck = { at: 0, dist: 0 };
      // A save = the ball was heading toward our net when we caught it: hold it until
      // it's properly turned around.
      grabInfo = { at: now, save: !!(ball && s.ballInfo && s.ballInfo.towardOurNet), counter: stance === 'meet' };
      if (!grabInfo.save) lastOffenseAt = now;
      if (now < regrabUntil) { brain.regrab.wins++; regrabUntil = 0; saveBrain(); }
      currentPlay = how === 'net' && CFG.offense ? pickPlay() : null;
      const u = unpredictability(s);
      const improvise = Math.random() < u * 0.5; // shots aren't working: don't just repeat the book
      if (improvise) currentPlay = null;
      throwAt = null;
      throwJitter = (Math.random() * 2 - 1) * u * CFG.maxAimJitter;
      shotState = { willFake: Math.random() < CFG.fakeChance + u * 0.3, faked: false, fakeUntil: 0, last: null,
                    pass: how === 'net' && !grabInfo.save ? choosePass(s, now) : null };
      ownFrames = [];
      if (grabInfo.save) { currentPlay = null; shotState.pass = null; } // a save: no plays, no passes
      const mv = how === 'net' && ball && CFG.offense && !improvise && !grabInfo.save ? pickMove() : null;
      replay = null;
      if (mv) {
        // Start from the point in their shot where the ball was where ours is now.
        const mir = s.side === 'right' ? -1 : 1;
        const rbx = (ball.x - me.x) * mir, rby = ball.y - me.y;
        let bestI = -1, bestD = CFG.replayDrift;
        for (let i = mv.holdIdx; i < mv.frames.length - 2; i++) {
          const d = hyp(mv.frames[i].bx - rbx, mv.frames[i].by - rby);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        if (bestI >= 0) replay = { m: mv, i: bestI, endAt: null };
      }
      setMode('THROW');
      keys.add('grapple');
      return keys;
    };
    const setupReady = () => CFG.offense && CFG.setupPlay && !!setupSpot(s);

    // --- Holding the ball: swing it and let go when it's aimed at the target ---
    if (mode === 'THROW') {
      const bd = ball ? hyp(ball.x - me.x, ball.y - me.y) : Infinity;
      if (grabCheck.at === 0) grabCheck = { at: now, dist: bd };
      // Did the rope catch the ball? On the rope it stays about the same distance away;
      // if it's pulled clearly away in the first moments, we grabbed something else (or
      // nothing): let go straight away so we can regrab.
      const missed = now - grabCheck.at > CFG.grabVerifyMs && now - grabCheck.at < 600 &&
                     bd > grabCheck.dist + CFG.grabMissSlack;
      if (!ball || fuelLocked || missed || bd > CFG.grappleRange * 1.4) {
        if (missed) decision = 'rope missed the ball: letting go to regrab';
        grabCheck = { at: 0, dist: 0 };
        setMode('IDLE'); // the rope didn't catch it, we lost it, or the grapple ran out
        return keys;
      }
      keys.add('grapple');
      const dx = ball.x - me.x, dy = ball.y - me.y;
      const speed = hyp(ball.vx, ball.vy);
      const pump = () => { // push across the rope, the way the ball is already moving
        const cross = dx * ball.vy - dy * ball.vx;
        let px = cross >= 0 ? -dy : dy, py = cross >= 0 ? dx : -dx;
        // A dead-still ball gives no direction: start the swing up and toward their side,
        // the same on either side (mirrored), so red and blue play identically.
        if (Math.abs(cross) < 1e-3) { px = fwdSign(s.side); py = -1; }
        // ...but never push ourselves into our back wall (that's how we get cornered)
        const towardBack = px * fwdSign(s.side) < 0;
        const nearBack = s.side === 'left' ? me.x - s.bounds.minX < CFG.backWallGap + 20
                                           : s.bounds.maxX - me.x < CFG.backWallGap + 20;
        if (!(towardBack && nearBack)) keys.add(px < 0 ? 'left' : 'right');
        keys.add(py < 0 ? 'up' : 'down');
        return keys;
      };
      const release = (move) => {
        keys.delete('grapple'); // let go
        if (grabInfo.save) pendingSave = { at: now, held: now - grabInfo.at };
        lastReleaseAt = now;
        regrabCounted = false;
        lastReleaseTarget = passNow ? 'pass' : throwTarget;
        if (passNow) { myPass = { mate: passNow.mate, spot: passNow.spot, at: now }; passNow = null; }
        else if (throwTarget !== 'backwall' && throwTarget !== 'wallclear') { // remember this throw to learn how it turns out
          const floor = s.floorY ?? s.bounds.maxY - 40;
          const fs = fwdSign(s.side);
          myThrow = {
            at: now, enemies: s.enemies.length, move: move || null, holdMs: now - grabInfo.at,
            enemyNames: s.enemies.map((e) => e.name),
            target: move ? 'replay' : currentPlay ? 'play' : throwAt ? throwAt.kind : 'net',
            targetName: throwAt && throwAt.name,
            own: ownFrames.length > 3 ? { frames: ownFrames.slice(), angle: Math.atan2(ball.vy, ball.vx * fs), speed } : null,
            play: currentPlay || {
              source: 'mine', dist: Math.abs(me.x - s.midX), height: floor - me.y,
              angle: Math.atan2(ball.vy, ball.vx * fwdSign(s.side)), speed, airborne: floor - me.y > 15,
            },
          };
        }
        currentPlay = null;
        replay = null;
        // With offense off, go straight back to the middle; otherwise follow up (set-up play).
        setMode(throwTarget === 'backwall' && CFG.offense ? 'SETUP' : 'IDLE');
        return keys;
      };

      // PLANNER: let go when now is the best release in sight (by value); otherwise keep the
      // swing going with its momentum.
      if (CFG.planner && !kickoffThrow) {
        const heldP = now - grabInfo.at;
        const pr = planRelease(s);
        const lowFuel = fuel < CFG.throwReserveMs + CFG.saveClearMs;
        // Keeping hold is worth something too: swinging builds speed for a better release later -
        // worth less the less grapple is left and the longer we've held already.
        const holdV = CFG.holdValue * Math.max(0, Math.min(1, (fuel - CFG.throwReserveMs) / 2000)) - 200 * heldP / 1000;
        const patient = heldP > CFG.swingPatienceMs && pr.now >= -100 && pr.now >= pr.best - 50;
        // (a release that gets it over is taken now - holding on only beats it if a much better one
        // is coming right up)
        const goodNow = pr.now >= 250 && pr.now >= pr.best - 150;
        if (heldP >= CFG.saveShotMinMs && pr.now > -1000 && ((pr.now >= pr.best - 1 && pr.now >= holdV) || goodNow || lowFuel || patient)) {
          decision = `planner: letting go now (future worth ${Math.round(pr.now)})`;
          return release(null);
        }
        if (fuel < CFG.throwReserveMs || now - modeSince > CFG.throwHardMaxMs) return release(null);
        decision = `planner: swinging - best release in ${pr.bestT.toFixed(2)}s (worth ${Math.round(pr.best)})`;
        pump();
        if (grabInfo.save && CFG.saveNoBackPush) keys.delete(fwdSign(s.side) > 0 ? 'left' : 'right');
        return keys;
      }

      // Kickoff won: drag the ball onto our side on the rope (pulling away from the
      // barrier, never into our back wall), stay alive, and only then attack with it.
      if (kickoffThrow) {
        const depth = (s.midX - ball.x) * fwdSign(s.side); // how far into OUR side the ball is
        const secured = depth >= CFG.kickoffDragDepth;
        const nearBack = s.side === 'left' ? me.x - s.bounds.minX < CFG.backWallGap + 20
                                           : s.bounds.maxX - me.x < CFG.backWallGap + 20;
        if (!secured && !nearBack && fuel > CFG.throwReserveMs + CFG.kickoffAttackReserveMs &&
            now - grabInfo.at < CFG.kickoffDragMaxMs) {
          decision = `kickoff: dragging it to our side (${Math.max(0, Math.round(depth))}/${CFG.kickoffDragDepth})`;
          keys.add(fwdSign(s.side) > 0 ? 'left' : 'right'); // pull toward our back
          return keys;
        }
        kickoffThrow = false;
        if (secured && fuel > CFG.throwReserveMs) {
          // Won: it's on our side and under control. Let go (not a throw) and start our
          // own offense on it: grapple jump above it, regrab, release at their net.
          keys.delete('grapple');
          lastReleaseAt = now;
          lastReleaseTarget = 'kickoff';
          replay = null; currentPlay = null;
          decision = 'kickoff WON: ball on our side, starting offense';
          kickoffWonAt = now;
          lastLesson = 'kickoff won: dragged it to our side';
          setMode('IDLE');
          return keys;
        }
        grabInfo.at = now; // couldn't drag it all the way: attack from here
        decision = 'kickoff: attacking from here';
      }

      // Replaying an opponent's recorded shot: press what they pressed, frame by frame
      // (mirrored to our side), checking the ball stays where it was for them.
      if (replay && throwTarget === 'net') {
        const m = replay.m, mirror = s.side === 'right';
        if (replay.i < m.frames.length) {
          const f = m.frames[replay.i];
          const rbx = (ball.x - me.x) * (mirror ? -1 : 1), rby = ball.y - me.y;
          if (hyp(rbx - f.bx, rby - f.by) > CFG.replayDrift) {
            replay = null; // ball control lost: finish with a normal throw below
            decision = `replay of ${m.from}'s shot drifted: normal throw`;
          } else if (fuel >= CFG.throwReserveMs) {
            const k = unbits(f.k);
            if (mirror ? k.r : k.l) keys.add('left');
            if (mirror ? k.l : k.r) keys.add('right');
            if (k.u) keys.add('up');
            if (k.d) keys.add('down');
            if (k.h) keys.add('heavy'); // they used heavy (X) here: so do we
            advanceReplay(replay, m, now);
            decision = `replaying ${m.from}'s shot (${replay.i - m.holdIdx}/${m.frames.length - m.holdIdx})`;
            return keys;
          }
        }
        if (replay) {
          // Their release point: let go when the ball flies the way theirs did (keep
          // swinging a moment to correct it if it doesn't).
          if (replay.endAt == null) replay.endAt = now;
          const aimR = Math.atan2(Math.sin(m.angle), Math.cos(m.angle) * fwdSign(s.side));
          const errR = Math.abs(wrap(Math.atan2(ball.vy, ball.vx) - aimR));
          decision = `replaying ${m.from}'s shot: release`;
          const okNow = releaseOk(s, true) && !(grabInfo.save && now - grabInfo.at < CFG.saveHoldMs);
          if ((okNow && (errR <= CFG.releaseTolerance * 1.5 || now - replay.endAt > CFG.replayCorrectMs)) ||
              fuel < CFG.throwReserveMs || now - modeSince > CFG.throwHardMaxMs) return release(m);
          return pump();
        }
      }

      // Is it safe to let go now? Follow the ball's free flight: it mustn't hit our goal or
      // us, and (except the set-up throw to our own back wall) it must be heading to their
      // side. A save is also held for at least saveHoldMs.
      const held = now - grabInfo.at;
      const saving = grabInfo.save;
      const flightOk = releaseOk(s, throwTarget !== 'backwall');
      const minHold = grabInfo.counter ? CFG.counterHoldMs : CFG.saveHoldMs; // counters go straight back
      const holdForSave = saving && (held < minHold || !flightOk);
      const outOfGrapple = fuel < CFG.throwReserveMs;
      const tooLong = now - modeSince > CFG.throwHardMaxMs;

      // A caught shot (a save): no controlling it. If its momentum is already carrying it their
      // way - let go and it flies at their net (or past a player) - throw it straight away.
      // Otherwise let go the moment it'll hit our back wall (above the net, not in it). Until
      // one of those, just ride its swing (never fight it). Grapple running low: let go at the
      // first safe moment.
      if (saving && !kickoffThrow) {
        const heldS = now - grabInfo.at;
        if (heldS >= CFG.saveShotMinMs) {
          const v = shotValue(s, ball);
          if (v >= CFG.shotGood && releaseOk(s, true)) {
            decision = `caught it: momentum's going their way - straight at their net (${v.toFixed(2)})`;
            return release(null);
          }
          if (hitsOurBackwall(s) && releaseOk(s, false)) {
            throwTarget = 'wallclear'; // not the set-up play: just cleared, then normal play
            decision = 'caught it: putting it on our back wall';
            return release(null);
          }
        }
        if (heldS >= CFG.saveHoldMs && fuel < CFG.throwReserveMs + CFG.saveClearMs && releaseOk(s, false)) {
          decision = 'caught it: grapple low, letting go while it is safe';
          return release(null);
        }
        if (outOfGrapple || tooLong) return release(null);
        // Neither yet: hold it (riding its swing, the usual save hold) and let go the first
        // moment it's safely heading to their side - no aiming, no extra control.
        if (held >= minHold && flightOk && reachesTheirSide(s)) { // it'll actually get over, not drop back in
          decision = 'caught it: safe and it will reach their side - letting go';
          return release(null);
        }
        decision = held < CFG.saveHoldMs ? 'caught it: holding it' : 'caught it: holding until it heads their way (or lines up with their net / our back wall)';
        pump();
        // A save never drags us back toward our own net: pushing toward our back wall takes us
        // (and the ball on the rope) into the corner, where it ends up dropped into the net.
        if (CFG.saveNoBackPush) keys.delete(fwdSign(s.side) > 0 ? 'left' : 'right');
        return keys;
      }

      // Offense: a swing that has died (ball barely moving on the rope) won't go anywhere.
      // Let go and regrab it for a fresh swing.
      const stallSafe = releaseOk(s, false) &&
        hyp(ball.x - me.x, ball.y - me.y) > CFG.playerRadius + (s.ballR || 10) + CFG.killMargin; // never drop it on ourselves
      if (!saving && throwTarget === 'net' && held > CFG.stallMs && speed < CFG.stallSpeed && !outOfGrapple && stallSafe) {
        keys.delete('grapple');
        replay = null; currentPlay = null;
        regrabUntil = now + CFG.regrabWindowMs;
        brain.regrab.tries++;
        saveBrain();
        decision = 'swing stalled: letting go to regrab';
        setMode('IDLE');
        return keys;
      }

      let aim, minSpeed;
      if (throwTarget === 'backwall') {
        const target = backWallPoint(s);
        aim = Math.atan2(target.y - ball.y, target.x - ball.x);
        minSpeed = CFG.setupThrowSpeed;
        decision = CFG.offense ? 'set-up: throwing to our back wall' : 'throwing it to our back wall';
      } else if (currentPlay) {
        // Copy a learned throw: same direction (mirrored to our side) and similar speed.
        aim = Math.atan2(Math.sin(currentPlay.angle), Math.cos(currentPlay.angle) * fwdSign(s.side));
        minSpeed = Math.max(CFG.minThrowSpeed, currentPlay.speed * CFG.copySpeedFactor);
        decision = `copying a throw${currentPlay.from ? ' from ' + currentPlay.from : ''} ` +
                   `(${Math.round(currentPlay.angle * -57.3)}deg, score ${currentPlay.score.toFixed(2)})`;
      } else {
        if (!throwAt) throwAt = chooseTarget(s, unpredictability(s));
        const target = targetPoint(s, throwAt);
        aim = Math.atan2(target.y - ball.y, target.x - ball.x) + throwJitter;
        minSpeed = CFG.minThrowSpeed;
        decision = throwAt.kind === 'player' ? `throwing at ${throwAt.name}` : 'throwing at their net';
      }
      if (throwTarget === 'net') minSpeed *= brain.throwPower; // learned: throw harder if they come back
      const err = Math.abs(wrap(Math.atan2(ball.vy, ball.vx) - aim));
      const timeUp = now - modeSince > (saving ? CFG.saveMaxMs : CFG.throwMaxMs);
      // Saving with the grapple running low: don't wait for it to die in a bad spot - let go
      // the moment it's safe (not into our net, not into us), using the ball's momentum: a
      // clear to our back wall if that's where it's heading.
      if (saving && held >= CFG.saveHoldMs && fuel < CFG.throwReserveMs + CFG.saveClearMs && releaseOk(s, false)) {
        decision = hitsOurBackwall(s) ? 'grapple low: clearing it off our back wall'
                                      : 'grapple low: letting go while it is safe';
        return release(null);
      }
      if (holdForSave && !outOfGrapple && !tooLong) {
        decision = held < CFG.saveHoldMs ? 'saving: holding it' : 'saving: holding until it heads their way';
        return pump();
      }
      // Good enough: the ball's free flight lands on their side (deep in it, or anywhere at
      // all on a kickoff) - after a kickoff grab straight away, otherwise once we've held it
      // a while without lining up the perfect throw.
      const landsX = landingX(s);
      const deep = landsX != null && (landsX - s.midX) * fwdSign(s.side) > (kickoffThrow ? CFG.centerMargin : CFG.deepLanding);
      const goodEnough = flightOk && deep && speed >= minSpeed * 0.6 &&
                         (kickoffThrow || held > CFG.throwMaxMs * 0.5);
      // A pass: let go the moment the ball would come past the spot near our teammate.
      if (shotState.pass && !holdForSave && !kickoffThrow && !outOfGrapple) {
        const ps = shotState.pass;
        if (now - ps.at > CFG.passMaxMs || fuel < CFG.throwReserveMs + 1000 || !s.players.some((q) => q.name === ps.mate)) shotState.pass = null; // no window (or grapple running low): shoot
        else if (held > 150 && passWindow(s, ps) && releaseOk(s, false)) {
          decision = `passing to ${ps.mate} (${ps.spot} of them)`;
          passNow = { mate: ps.mate, spot: ps.spot };
          shotState.pass = null;
          return release(null);
        } else {
          decision = `looking for a pass to ${ps.mate} (${ps.spot} of them)`;
          return pump();
        }
      }
      // Planned shot: rate letting go right now by where the ball would really go (bounces,
      // their players, their net). Take it when it's good - but now and then swing past the
      // first good moment (a fake) so they can't just read the swing.
      if (throwTarget === 'net' && !holdForSave && !kickoffThrow && flightOk && held > 150 && !outOfGrapple) {
        const v = shotValue(s, ball);
        shotState.last = v;
        const bh = bestHold();
        const early = bh && held < bh.ms - 150 && v < 0.9 && fuel > CFG.throwReserveMs + (bh.ms - held);
        if (early && v >= CFG.shotGood) { decision = `building the swing (holds of ~${bh.ms} ms work best)`; return pump(); }
        if (v >= CFG.shotGood) {
          if (shotState.willFake && !shotState.faked && fuel > CFG.throwReserveMs + 1200) {
            shotState.faked = true;
            shotState.fakeUntil = now + 300;
          }
          if (now >= shotState.fakeUntil) {
            decision = `planned shot (rated ${v.toFixed(2)}${shotState.faked ? ', after a fake' : ''})`;
            return release(null);
          }
          decision = 'fake: swinging past a good release';
          return pump();
        }
      }
      if ((speed >= minSpeed && err <= CFG.releaseTolerance && flightOk) || goodEnough ||
          outOfGrapple || tooLong || (timeUp && flightOk)) {
        if (goodEnough && kickoffThrow) decision = 'kickoff: sending it to their side';
        return release(null);
      }
      return pump();
    }

    // --- Mid-jump: boost off the ground, then let go and grapple the ball in mid-air
    //     once it's the nearest thing in reach ---
    if (mode === 'JUMP') {
      const t = now - modeSince;
      if (t < jump.boostMs) { keys.add('grapple'); if (jump.heavy) keys.add('heavy'); }
      if (jump.up) keys.add('up');
      const offenseJump = jump.label === 'pickup' || jump.label === 'setup';
      // Air moves at the top of the jump (only while the floor is the nearest thing, so the
      // grapple takes the floor): a tap for more height, a balloon (hold up + grapple and hang
      // there), or a super jump out of the balloon. The ball can still be grabbed any time it
      // becomes the nearest thing - let go of the floor, then grab it.
      const st = jump.style || 'plain', A = jump.air;
      if (st !== 'plain' && A && t >= jump.boostMs && !onFloor) {
        const nearTop = me.vy > -40;
        if (A.phase === 'rise' && nearTop && groundNearest && !fuelLocked) { A.phase = 'move'; A.at = now; A.y0 = me.y; airTrack = { kind: st, at: now, y0: me.y, minY: me.y, vys: [] }; }
        if (A.phase === 'move') {
          const k = now - A.at;
          if (st === 'boost') {
            if (k < CFG.airBoostMs) { keys.add('grapple'); keys.add('up'); } else A.phase = 'done';
          } else if (st === 'balloon' || st === 'bsuper') {
            const hang = st === 'bsuper' ? 120 : CFG.balloonMaxMs;
            if (k < hang && groundNearest && !(ballNearest && jump.grab)) { keys.add('grapple'); keys.add('up'); if (airTrack) airTrack.vys.push(me.vy); }
            else if (st === 'bsuper') { A.phase = 'super'; A.at = now; }
            else A.phase = 'done';
          }
        }
        if (A.phase === 'super') { // out of the balloon: up + X + Z
          const k = now - A.at;
          if (k < 40) { /* a moment off the grapple */ } else if (k < 40 + CFG.superJumpMs) { keys.add('grapple'); keys.add('up'); keys.add('heavy'); }
          else A.phase = 'done';
        }
      }
      if (CFG.planner) {
        const bdP = ball ? hyp(ball.x - me.x, ball.y - me.y) : Infinity;
        const R0 = s.ballR || 10;
        if (A && A.phase === 'move' && ballNearest && jump.grab) { keys.delete('grapple'); A.phase = 'done'; A.freedAt = now; return keys; }
        if (ball && !onFloor && t > jump.boostMs + 40 && ballNearest && !fuelLocked && fuel > CFG.throwReserveMs &&
            bdP > CFG.playerRadius + R0 + 2 && bdP - R0 <= CFG.grappleRange && !(A && A.freedAt && now - A.freedAt < 30) &&
            (safeToGrab(s) || Math.max(moveClearance(s, -1), moveClearance(s, 0), moveClearance(s, 1)) < 0)) {
          lastJumpEnd = now;
          decision = 'planner: in the air, the ball is the nearest thing - grab it (+500)';
          return startThrow('net');
        }
        if (ball && t >= jump.boostMs && !onFloor && !(A && A.phase === 'move')) {
          const st2 = airSteer(s);
          keys.delete('left'); keys.delete('right');
          if (st2.h) keys.add(st2.h < 0 ? 'left' : 'right');
          decision = `planner: in the air, steering ${st2.h < 0 ? 'left' : st2.h > 0 ? 'right' : 'straight'} (future ${Math.round(st2.score)})`;
        }
        const extraP = st === 'balloon' ? CFG.balloonMaxMs + 300 : st === 'bsuper' ? 900 : st === 'boost' ? 500 : 0;
        if ((onFloor && t > jump.boostMs + 150) || t > Math.max(CFG.jumpMs, brain.lift[jump.type] + brain.air[jump.type] + extraP)) {
          setMode('IDLE'); lastJumpEnd = now;
        }
        return keys;
      }
      if (offenseJump) {
        // Offense: no sideways push while boosting off the ground (that runs us into the
        // ball); once up, steer to hover right over it, where it's the nearest thing.
        if (t >= jump.boostMs && ball && !onFloor) {
          if (ball.x < me.x - CFG.hoverTolerance) keys.add('left');
          else if (ball.x > me.x + CFG.hoverTolerance) keys.add('right');
        }
      } else if (jump.dir && (t >= jump.boostMs || jump.type === 'super')) {
        // sideways once off the ground (matches the prediction) - except a super jump, where
        // holding the direction while pressing X+Z angles the jump itself that way
        keys.add(jump.dir);
      }
      // Emergency: in the air, the ball is the nearest thing and it's going to hit us
      // whatever we do (no steering option keeps us clear) - grab it anyway: the rope is
      // our best chance, and not grabbing means certain death.
      const bdNow = ball ? hyp(ball.x - me.x, ball.y - me.y) : Infinity;
      const doomed = !!ball && !onFloor && Math.max(moveClearance(s, -1), moveClearance(s, 0), moveClearance(s, 1)) < 0;
      const emergencyGrab = doomed && ballNearest && bdNow >= CFG.playerRadius + (s.ballR || 10) + 2 && !fuelLocked;
      if (emergencyGrab) decision = 'going to be hit: emergency grab';
      const onFloorRope = (A && A.phase === 'move' && keys.has('grapple')) || (A && A.phase === 'super' && keys.has('grapple'));
      if (onFloorRope && ballNearest && jump.grab) { keys.delete('grapple'); A.phase = 'done'; A.freedAt = now; } // let go of the floor to grab the ball
      if (ball && !onFloor && now - avoidingAt < 150 && avoidTight && ballNearest && !fuelLocked && fuel > CFG.throwReserveMs &&
          bdNow > CFG.playerRadius + (s.ballR || 10) + 2 && bdNow - (s.ballR || 10) <= CFG.grappleRange) {
        avoidingAt = 0; lastJumpEnd = now;
        decision = 'avoiding it in the air - and it is the nearest thing: grapple it';
        return startThrow('net');
      }
      if (jump.grab && ball && t > jump.boostMs + CFG.regrabGapMs && ballNearest && !(A && A.freedAt && now - A.freedAt < 30) &&
          hasFuel(CFG.carryMinMs) && (onOurSide(s, ball.x) || s.kickoff || kickContest(s)) &&
          ((bdNow >= CFG.grabMin && safeToGrab(s)) || emergencyGrab)) {
        lastJumpEnd = now;
        return startThrow(jump.label === 'pickup' && setupReady() ? 'backwall' : 'net');
      }
      const extra = st === 'balloon' ? CFG.balloonMaxMs + 300 : st === 'bsuper' ? 900 : st === 'boost' ? 500 : 0;
      if (t > Math.max(CFG.jumpMs, brain.lift[jump.type] + brain.air[jump.type] + extra) || (extra && onFloor && t > jump.boostMs + 300)) {
        setMode('IDLE'); lastJumpEnd = now;
      }
      return keys;
    }

    // --- Set-up play: ball was thrown to our back wall; go to the ramp, wait for it,
    //     jump + grab, and throw at their net straight away ---
    if (mode === 'SETUP') {
      const ramp = setupSpot(s);
      // Defend first: if the ball turns into a threat, drop the set-up and defend.
      // (The set-up bounces the ball near our own goal, so only count the goal as
      // threatened if the ball is actually heading toward it.)
      const threat = !!ball && onOurSide(s, ball.x) && (() => {
        const q = pathInfo(s);
        return q.hitMe || (q.hitGoal && s.ballInfo && s.ballInfo.towardOurNet);
      })();
      if (!ball || !ramp || threat || !onOurSide(s, ball.x) || now - modeSince > CFG.setupMaxMs) {
        setMode('IDLE');
        if (threat) decision = 'set-up dropped: defending first';
      } else {
        const dist = hyp(ball.x - me.x, ball.y - me.y);
        const atRamp = Math.abs(ramp.x - me.x) <= CFG.rampTolerance;
        const safe = predictClosest(me, ball).d >= CFG.dangerRadius;
        if (!safe) { // it's bouncing back at us: get clear first
          decision = 'set-up: ball coming back at me, stepping clear';
          keys.add(ball.x > me.x ? 'left' : 'right');
          return keys;
        }
        if (atRamp && onFloor && rested && groundNearest && dist <= CFG.grappleRange + 30 &&
            hasFuel(jumpFuel('regular')) && hyp(ball.vx, ball.vy) < CFG.setupBallSpeed) {
          decision = 'set-up: jump + grab from the ramp';
          return startJump('regular', ball.x < me.x ? 'left' : 'right', true, 'setup');
        }
        decision = atRamp ? 'set-up: on the ramp, waiting for the ball' : 'set-up: going to the ramp';
        return moveTo(ramp.x, 4);
      }
    }

    const ballHere = !!ball && onOurSide(s, ball.x);
    const dist0 = ball ? hyp(ball.x - me.x, ball.y - me.y) : Infinity;
    const clampHalf = (x) => {
      const limit = s.side === 'left' ? s.midX - CFG.wallMargin : s.midX + CFG.wallMargin;
      return s.side === 'left' ? Math.max(s.bounds.minX + CFG.backWallGap, Math.min(x, limit))
                               : Math.min(s.bounds.maxX - CFG.backWallGap, Math.max(x, limit));
    };

    const tm = teamInfo(s, now); // teammates: who's got it, who's closer
    // Avoiding the ball, and it's become the nearest thing in grapple reach: grapple it
    // (that's what the grapple will latch onto anyway - better on the rope than hitting us).
    if (ball && mode !== 'THROW' && now - avoidingAt < 150 && avoidTight && ballNearest && !tm.holding && !fuelLocked &&
        fuel > CFG.throwReserveMs && dist0 > CFG.playerRadius + (s.ballR || 10) + 2 && dist0 - (s.ballR || 10) <= CFG.grappleRange) {
      avoidingAt = 0;
      lastJumpEnd = now;
      decision = 'avoiding it - and it is the nearest thing: grapple it';
      return startThrow('net');
    }
    // --- In the air with the ball the nearest thing in reach: grab it, whatever we were
    //     doing (the ground is out of the way, so the grapple will catch the ball) ---
    // Our throw didn't make it (still on our side and not heading over): go straight back
    // for it.
    if (CFG.offense && ballHere && lastReleaseTarget === 'net' && now - lastReleaseAt > CFG.noRegrabMs &&
        now - lastReleaseAt < 2000 && ball.vx * fwdSign(s.side) < CFG.incomingSpeed && regrabUntil < now &&
        !regrabCounted) {
      regrabUntil = now + CFG.regrabWindowMs;
      regrabCounted = true;
      brain.regrab.tries++;
      saveBrain();
    }
    if (now < regrabUntil && ballHere && mode !== 'JUMP') decision = decision || 'my throw came back: regrab';
    const ownThrowFlying = now >= regrabUntil && (now - lastReleaseAt < CFG.noRegrabMs ||
      (!!ball && !!s.ballInfo && ball.vx * fwdSign(s.side) > CFG.incomingSpeed && now - lastReleaseAt < 1500));
    if (!onFloor && (ballHere || s.kickoff || kickContest(s)) && ballNearest && !ownThrowFlying && !tm.holding && hyp(ball.x - me.x, ball.y - me.y) >= CFG.grabMin &&
        hasFuel(CFG.carryMinMs) && safeToGrab(s)) {
      decision = 'in the air, ball is the nearest thing: grab';
      return startThrow('net');
    }

    // PLANNER on the ground: is there a jump that leads to a catch (a save, a pickup, a
    // kickoff grab - all the same thing: +500)? If it says jump now, jump; if it says soon,
    // wait for it. Otherwise move with the feet by scoring futures.
    if (CFG.planner && onFloor) {
      setMode('PLAN');
      if (!ball) { decision = 'planner: no ball yet - to my spot'; return balanceTo(home, CFG.positionMaxSpeed); }
      if (tm.holding) { decision = `planner: ${tm.holding.name} has it - giving them space`; return balanceTo(clampHalf(tm.holding.x + (tm.holding.x > home ? -110 : 110)), CFG.positionMaxSpeed); }
      const pP = pathInfo(s);
      const fuelFn = (t) => hasFuel(jumpFuel(t));
      const ours = ballHere || !!s.kickoff || kickContest(s);
      const threat = !!pP.hitGoal || !!pP.hitMe || !!(s.ballInfo && s.ballInfo.towardOurNet && s.ballInfo.speed > CFG.incomingSpeed);
      // not thrown yet (on their rope, or still right next to one of them on their side): don't jump at it
      const nearThem = !ballHere && s.enemies.some((e) => hyp(e.x - ball.x, e.y - ball.y) < CFG.grappleRange * 1.3);
      const onTheirRope = (!!ropeHolder(s) || nearThem) && dist0 > 160;
      if (!onTheirRope && rested && groundNearest && (ours || threat) && !(tm.closer && !threat)) {
        const plan = planSave(s, now, pP, fuelFn);
        if (plan && plan.wait <= decideDt / 1000 + 0.01) return doSavePlan(plan);
        if (plan) {
          setMode('WAIT_JUMP');
          planHold = plan.minC > killM(s) + CFG.planTrustGap ? { at: now } : null;
          decision = `planner: catch planned - ${plan.type} jump in ${plan.wait.toFixed(2)}s`;
          if (plan.run) keys.add(plan.run);
          return keys;
        }
      }
      // Where we'd like to be if no catch is in sight: near the ball when it's loose on our
      // side (behind it), our spot (leaning toward their swing) when it's over there.
      let spotX = home;
      if (ours && !threat && !tm.closer) spotX = clampHalf(ball.x - fwdSign(s.side) * 60);
      else if (!ours) { const sw = readSwing(s, now); if (sw && sw.spread < 220) spotX = clampHalf(home + (clampHalf(sw.x) - home) * CFG.anticipate); }
      const mv = mpcMove(s, now, pP, fuelFn, spotX);
      if (mv) {
        decision = `planner: ${mv.h < 0 ? 'left' : mv.h > 0 ? 'right' : 'staying'} - best future ` +
                   (mv.plan ? `(catch in ${(MPC_HOLD + mv.plan.t).toFixed(2)}s)` : `(${Math.round(mv.score)})`);
        if (mv.h) keys.add(mv.h < 0 ? 'left' : 'right');
        else if (!threat && Math.abs(spotX - me.x) < 30) return balanceTo(spotX, CFG.balanceMaxSpeed); // hold the spot (no sliding)
        return keys;
      }
      decision = 'planner: every future touches it - the safety check picks the way out';
      return keys;
    }

    // --- Copying a watched move: press what they pressed (mirrored), grab when they grabbed.
    if (mode === 'COPY') {
      const c = copy;
      let f = c && ball ? c.m.frames[c.i] : null;
      let stop = null, cur = null;
      if (!c) stop = [0, 'lost'];
      else if (!f) stop = [0.1, "ran out before getting the ball"];
      else {
        cur = ctxNow(s);
        // Stay in step with their timing: if the ball is where it was a few frames later
        // for them, skip ahead to that frame (keeping any grapple press we skip over).
        let bestJ = c.i, drift = hyp(cur.bx - f.bx, cur.by - f.by);
        const ahead = Math.max(2, Math.round(100 / (c.m.dtMs || MOVE_DT_OLD)));
        for (let j = c.i + 1; j <= Math.min(c.m.frames.length - 1, c.i + ahead); j++) {
          const q = c.m.frames[j], d = hyp(cur.bx - q.bx, cur.by - q.by);
          if (d < drift - 6) { drift = d; bestJ = j; }
        }
        c.sawG = false;
        for (let j = c.i; j < bestJ; j++) if (unbits(c.m.frames[j].k).g) c.sawG = true;
        if (bestJ !== c.i) { c.i = bestJ; c.pos = bestJ; f = c.m.frames[bestJ]; c.resync = (c.resync || 0) + 1; }
        if (drift > CFG.copyDrift * (c.kind === 'kick' ? 1.5 : 1)) stop = [0.1, 'the ball went somewhere else'];
        else if (c.i > c.m.holdIdx + 200 / (c.m.dtMs || MOVE_DT_OLD)) stop = [0, "didn't get the ball"];
        else if (c.kind !== 'def' && pathInfo(s).hitGoal && s.ballInfo && s.ballInfo.towardOurNet) stop = [0.3, 'defending first'];
      }
      if (stop) {
        if (c) { copyResult(c, stop[0], stop[1]); copyBlock[c.kind] = now + 800; }
        copy = null;
        setMode('IDLE');
        decision = `copy stopped: ${stop[1]}`;
      } else {
        const k = unbits(f.k), mir = s.side === 'right';
        if (c.sawG) k.g = true;
        // Steer to fix the difference: if the ball is further along (left-frame x) from us than
        // it was from them, drift that way; they weren't pressing sideways, so we can.
        const ex = cur.bx - f.bx;
        if (!k.l && !k.r && Math.abs(ex) > CFG.copyNudge) { if (ex > 0) k.r = true; else k.l = true; c.nudged = true; }
        if (mir ? k.r : k.l) keys.add('left');
        if (mir ? k.l : k.r) keys.add('right');
        if (k.u) keys.add('up');
        if (k.d) keys.add('down');
        if (k.h) keys.add('heavy');
        const bdNow = hyp(ball.x - me.x, ball.y - me.y);
        if (k.g) {
          if (ballNearest && bdNow >= CFG.grabMin && hasFuel(CFG.carryMinMs) && safeToGrab(s)) {
            // they grabbed here: so do we
            brain.copyStats.grabs++;
            const m = c.m, i = c.i, kind = c.kind;
            if (kind === 'def') lastCopy = { c, at: now };
            copy = null;
            const out = startThrow('net');
            if (kind === 'off') replay = { m, i: Math.max(i, m.holdIdx), endAt: null }; // and carry on with their throw
            if (kind === 'kick') kickoffThrow = true;                                 // and drag it like they did
            decision = `copying ${m.from}: grabbed it like they did`;
            return out;
          }
          // a grapple on the ground = their grapple jump
          if (onFloor && groundNearest && hasFuel(jumpFuel('low')) && now > c.boostUntil) c.boostUntil = now + CFG.jumpGrappleMs;
        }
        if (now < c.boostUntil && groundNearest) keys.add('grapple');
        advanceReplay(c, c.m, now);
        decision = `copying ${c.m.from}'s ${kindName(c.kind)} (${Math.min(c.i, c.m.holdIdx)}/${c.m.holdIdx})` +
                   (k.h ? ' +HEAVY' : '');
        return keys;
      }
    }

    // --- Kickoff: while the ball sits still in the middle at the start of a round, go for
    //     it instead of waiting in the middle: stand at the learned offense distance on
    //     our side, grapple-jump above it, regrab it and win it to their side. ---
    // (while the kickoff is being fought over and the ball isn't loose on our side - there
    // the normal offense goes for it - keep going for it instead of waiting in the middle)
    if (CFG.kickoffs && ball && (s.kickoff || (kickContest(s) && !ballHere && !ropeHolder(s)))) {
      setMode('KICKOFF');
      const kb = ball || { x: s.midX, y: (s.floorY ?? s.bounds.maxY - 40) - 10, vx: 0, vy: 0 };
      if (tm.closer) { // one of us goes for it, not both: the closer teammate takes it
        decision = `kickoff: ${tm.closer.name} is closer, covering`;
        return balanceTo(home, CFG.positionMaxSpeed);
      }
      if (kickEp && !kickEp.plan && !kickEp.copy && tryCopy(s, 'kick', now)) { // a kickoff we watched someone win
        kickEp.copy = copy;
        decision = `kickoff: copying ${copy.m.from}'s kickoff`;
        return keys;
      }
      if (!pickupPlan || now - pickupPlan.at > CFG.pickupPlanMs) pickupPlan = chooseKickoff(s, kb, now);
      const plan = pickupPlan;
      const spot = clampHalf(kb.x - fwdSign(s.side) * plan.d);
      const dir = kb.x < me.x ? 'left' : 'right';
      if (Math.abs(spot - me.x) <= CFG.standStill * 2 && Math.abs(me.vx) < 60 && onFloor && rested &&
          groundNearest && hasFuel(jumpFuel(plan.t))) {
        const order = [plan.t, ...CFG.offenseJumps.filter((t) => t !== plan.t)];
        const type = order.find((t) => !jumpHitsBall(s, t, dir));
        if (type) {
          decision = `kickoff: ${type} grapple jump to get above the ball`;
          if (kickEp) kickEp.plan = `${heightBand(s, kb)}|${plan.d}|${type}`;
          pendingPickup = { key: type === plan.t ? plan.key : `${heightBand(s, kb)}|${plan.d}|${type}`, at: now };
          pickupPlan = null;
          return startJump(type, dir, true, 'pickup');
        }
      }
      decision = `kickoff: moving in for a ${plan.t} grapple jump`;
      return balanceTo(spot, CFG.kickoffApproachSpeed);
    }

    // --- A throw is coming our way: start moving to where it will come down the moment
    //     it's released (in the 'meet' stance: to meet it early on its path) ---
    const incoming = !!ball && s.ballInfo && s.ballInfo.towardOurNet && s.ballInfo.speed > CFG.incomingSpeed;
    if (ball && !ballHere && lastBallHere) chooseStance(s);      // it just went over: pick a stance
    if (ball) lastBallHere = ballHere;
    if (incoming && !incomingSince) incomingSince = now;
    if (!incoming) incomingSince = 0;
    if (!ballHere && incoming) {
      const spot = stance === 'meet' ? meetSpot(s) : readSpot(s);
      if (spot != null) {
        // remember roughly where their throws come down (for the 'shadow' stance)
        const land = Math.abs(spot - s.midX);
        brain.landAvg = brain.landAvg == null ? land : brain.landAvg + 0.1 * (land - brain.landAvg);
        if (now - incomingSince < readDelay * 1000 && !(pathInfo(s).hitMe)) { // a varied reaction time (never when it's coming at us)
          setMode('READ');
          decision = `they released it: reading it (${stance})`;
          return keys;
        }
        // A teammate is already much closer to where it's coming down: cover the rest instead.
        const mateOnIt = tm.mates.find((m) => Math.abs(m.x - spot) < Math.abs(me.x - spot) - 60);
        if (mateOnIt) {
          setMode('READ');
          decision = `${mateOnIt.name} is on it: covering the other side`;
          return balanceTo(clampHalf(spot + (mateOnIt.x > spot ? -90 : 90)), CFG.positionMaxSpeed);
        }
        // React at once (no waiting to read it): if the save plan says jump now, jump now.
        if (onFloor && rested && groundNearest && !ropeHolder(s)) { // never before they've let go
          const pq = pathInfo(s);
          const plan = planSave(s, now, pq, (t) => hasFuel(jumpFuel(t)));
          // (only when the catch is close: a plan made with the ball far away is a guess)
          if (plan && plan.wait <= decideDt / 1000 + 0.01 && plan.t < CFG.earlySaveT) return doSavePlan(plan);
        }
        if (tryCopy(s, 'def', now)) { decision = `copying ${copy.m.from}'s save`; return keys; }
        setMode('READ');
        if (CFG.mpc && onFloor && !ropeHolder(s)) { // move by scoring futures, the read spot just a nudge
          const mv = mpcMove(s, now, pathInfo(s), (t) => hasFuel(jumpFuel(t)), clampHalf(spot));
          if (mv && mv.plan) {
            decision = `they released it: ${mv.h < 0 ? 'left' : mv.h > 0 ? 'right' : 'staying'} - best future: catch in ${(MPC_HOLD + mv.plan.t).toFixed(2)}s`;
            if (mv.h) keys.add(mv.h < 0 ? 'left' : 'right');
            return keys;
          }
        }
        decision = stance === 'meet' ? 'counter: moving to meet it early'
                                     : `they released it: moving to where it will come down (${stance})`;
        return balanceTo(clampHalf(spot), CFG.positionMaxSpeed);
      }
    }

    // --- Ball on their side (or not in play yet): get to the middle of our side once,
    //     braking so we don't overshoot, then stand completely still ---
    if (!ballHere) {
      const off = home - me.x;
      if (!positioned && Math.abs(off) <= CFG.positionTolerance && Math.abs(me.vx) < CFG.settleSpeed) {
        positioned = true;
      }
      // They've got it on the rope: read their swing and lean toward where it'll come.
      const sw = CFG.anticipate > 0 && positioned ? readSwing(s, now) : null;
      if (sw && sw.spread < 220) {
        const conf = 1 - sw.spread / 250; // a swing that could go anywhere: lean less
        const lean = Math.max(-CFG.anticipateMax, Math.min(CFG.anticipateMax, (clampHalf(sw.x) - home) * CFG.anticipate * conf));
        setMode('ANTICIPATE');
        decision = `reading ${sw.from}'s swing: leaning ${Math.round(Math.abs(lean))} ${lean * fwdSign(s.side) > 0 ? 'forward' : 'back'}`;
        return balanceTo(home + lean, CFG.positionMaxSpeed);
      }
      setMode(positioned ? 'WAIT' : 'POSITION');
      decision = positioned ? 'balancing in the middle' : 'getting into position';
      return balanceTo(home, positioned ? CFG.balanceMaxSpeed : CFG.positionMaxSpeed);
    }

    // On an opponent's rope (even over our side) and not right on top of us: it hasn't been
    // thrown yet. Reposition, but don't jump at a ball that isn't flying yet.
    if (ball && ropeHolder(s) && hyp(ball.x - me.x, ball.y - me.y) > 160) {
      setMode('WAIT');
      decision = `${ropeHolder(s).name} still has it on the rope: repositioning, not jumping yet`;
      return balanceTo(clampHalf(home), CFG.positionMaxSpeed);
    }

    // The ball is on our side: free to move until it goes back over.
    positioned = false;
    positionStart = 0;
    const bi = s.ballInfo;
    const dx = ball.x - me.x;
    const dist = hyp(dx, ball.y - me.y);
    const p = pathInfo(s);
    const safe = p.closest.d >= CFG.dangerRadius;
    const canGrabBall = ballNearest && dist >= CFG.grabMin && hasFuel(CFG.carryMinMs);
    const canJump = onFloor && rested && groundNearest;
    const towardBall = dx < 0 ? 'left' : 'right';
    // Away from a point, but not into a wall.
    const awayFrom = (x) => {
      let d = x > me.x ? 'left' : 'right';
      if (d === 'left' && me.x - s.bounds.minX < 40) d = 'right';
      if (d === 'right' && s.bounds.maxX - me.x < 40) d = 'left';
      return d;
    };
    const ballTop = (y) => y - (s.ballR || 10);
    // Step by scoring futures (instead of a fixed "step away" rule), when on the ground.
    const mpcStep = (label) => {
      if (!CFG.mpc || !onFloor || hyp(ball.vx, ball.vy) < CFG.incomingSpeed) return null; // real shots only (a loose ball is offense)
      const mv = mpcMove(s, now, p, (t) => hasFuel(jumpFuel(t)), null);
      if (!mv) return null;
      setMode('DODGE');
      decision = `${label}: ${mv.h < 0 ? 'left' : mv.h > 0 ? 'right' : 'staying'} - best future: ` +
                 (mv.plan ? `catch in ${(MPC_HOLD + mv.plan.t).toFixed(2)}s` : 'staying clear');
      if (mv.h) keys.add(mv.h < 0 ? 'left' : 'right');
      return keys;
    };

    // A slow ball rolling on our floor that isn't going in or at us: that's offense, not defence.
    // (one rolling slowly TOWARD us is caught from above by the save planner instead - walking
    // up to it from the front just lets it roll into us - and that grab starts offense too)
    const rollingSlow = (s.floorY ?? s.bounds.maxY) - ball.y < 30 && bi.speed < CFG.slowRoll && !p.hitGoal && !p.hitMe &&
                        (!bi.towardOurNet || bi.speed < CFG.incomingSpeed);

    // PLAN THE SAVE (x/y over time): incoming shot -> plan the jump -> after the jump, grab it
    // the moment it's the nearest thing. Covers: aimed at me (jump clear of it and catch it),
    // over me (time the jump to catch it as it passes), rolling / in front of me (jump over and
    // catch it from above), and running under it with momentum (catch it on the way).
    const threatNow = !rollingSlow && (p.hitMe || p.hitGoal || (bi.towardOurNet && bi.speed > CFG.incomingSpeed));
    if (threatNow && onFloor && rested && groundNearest && !ropeHolder(s)) {
      const plan = planSave(s, now, p, (t) => hasFuel(jumpFuel(t)));
      planText = plan ? `${plan.kind}: ${plan.type} jump${plan.style !== 'plain' ? ' + ' + plan.style : ''}${plan.dir ? ' ' + plan.dir : ''}` +
        `${plan.wait ? ` in ${plan.wait.toFixed(2)}s${plan.run ? ' running ' + plan.run : ''}` : ' now'}` +
        `, catch at (${r0(plan.at.x)}, ${r0(plan.at.y)}) after ${plan.t.toFixed(2)}s` : 'no safe catch found';
      if (plan && plan.wait <= decideDt / 1000 + 0.01) return doSavePlan(plan);
      if (plan) {
        setMode('WAIT_JUMP');
        planHold = plan.minC > killM(s) + CFG.planTrustGap ? { at: now } : null; // a plan with room to spare is trusted
        decision = `save plan (${plan.kind}): ${plan.type} jump in ${plan.wait.toFixed(2)}s` +
                   (plan.run ? `, running ${plan.run} under it` : '');
        if (plan.run) keys.add(plan.run);
        return keys;
      }
    } else if (!threatNow) planText = '-';

    // 0. It's about to pass just over our head while we're on the ground: a small jump
    //    (low, else regular) that stays clear of it puts us close enough that the ball is
    //    the nearest thing, so we can grab it - a save instead of letting it by.
    const over = p.closest;
    const passingOver = onFloor && over.y < me.y - CFG.playerRadius &&
                        over.d < CFG.lowSaveReach && Math.abs(over.x - me.x) < CFG.grappleRange * 0.6 &&
                        (bi.towardOurNet || !!p.hitGoal) && bi.speed > CFG.incomingSpeed;
    if (passingOver && canJump) {
      // Find the smallest jump, and when to start it, where the ball becomes the nearest
      // thing (so the grapple catches it) before it ever gets too close to us. The jump
      // doesn't need to be safe after that: once we've grabbed it the rope holds it off.
      let plan = null;
      for (let w = 0; w <= CFG.safetyMaxWait + 1e-9 && !plan; w += CFG.safetyWaitStep) {
        for (const t of ['low', 'regular', 'high']) {
          if (!hasFuel(jumpFuel(t))) continue;
          const g = grabWindow(s, t, w);
          if (g) { plan = { type: t, wait: w, at: g }; break; }
        }
      }
      if (plan && plan.wait < CFG.safetyWaitStep) {
        setMode('DEFEND');
        decision = `just over my head: ${plan.type} jump + grab to save it`;
        return startJump(plan.type, null, true, 'defend');
      }
      if (plan) {
        setMode('WAIT_JUMP');
        decision = `just over my head: ${plan.type} jump in ${plan.wait.toFixed(2)}s to save it`;
        return keys;
      }
    }

    // 1. The ball will hit us.
    if (p.hitMe && (!p.hitGoal || p.hitMe.t <= p.hitGoal.t)) {
      const fromAbove = p.hitMe.y < me.y - CFG.dangerRadius * 0.5;
      const away = awayFrom(p.hitMe.x);
      if (fromAbove) {
        // Dropping onto us: time a jump sideways out of its way, then grab it after.
        if (p.hitMe.t <= CFG.dodgeLead && canJump && hasFuel(jumpFuel('regular'))) {
          // Which way out keeps us clearest? (Away from where it lands isn't always it: a ball
          // also moving fast that way just follows us.)
          let best = null;
          for (const d of [away, away === 'left' ? 'right' : 'left', null]) {
            const c = jumpClearance(s, 'regular', d);
            if (!best || c > best.c) best = { d, c };
          }
          if (best.c > killM(s)) {
            decision = `dropping on me: jumping ${best.d || 'straight up'} out of the way`;
            return startJump('regular', best.d, true, 'dodge-out');
          }
        }
        const m1 = mpcStep('dropping on me'); if (m1) return m1;
        setMode('DODGE');
        decision = 'dropping on me: stepping out of the way';
        keys.add(away);
        return keys;
      }
      // Coming in low: jump over it (learned height), then grab it from above.
      if (canJump && dist > CFG.jumpMinBallDist && hasFuel(CFG.lowJumpMs)) {
        const needH = (me.y + r) - ballTop(p.hitMe.y) + CFG.jumpClearance;
        // Jump early enough for the slowest jump that clears it to leave the ground in time
        // (lift-off delays are learned).
        const clears = JUMP_ORDER.filter((t) => brain.apex[t] >= needH);
        const lead = Math.max(...(clears.length ? clears : ['super']).map((t) => brain.lift[t])) / 1000 + CFG.jumpLead;
        if (p.hitMe.t <= lead) {
          // Straight up, or drifting over the ball (against its direction): whichever the
          // prediction says stays clearest. Straight up lands on slow balls; drifting at
          // fast ones runs into them.
          const against = Math.abs(ball.vx) > 20 ? (ball.vx > 0 ? 'left' : 'right') : awayFrom(ball.x);
          let bestDir = null, bestC = -Infinity;
          for (const d of [null, against]) {
            const type = chooseJump(needH, bucketFor(needH, ball), s, d);
            if (!type) continue;
            const c = Math.min(jumpClearance(s, type, d), d ? jumpClearance(s, type, null) : Infinity);
            if (c > bestC) { bestC = c; bestDir = d; }
          }
          decision = 'aimed at me: jumping over';
          const j = bestC > -Infinity ? smartJump(needH, bestDir, hasFuel(CFG.carryMinMs), 'over') : null;
          if (j) return j;
          // No safe jump this instant. Backing away just lets a low ball chase us into the
          // corner, so hold still and let the safety check time the jump.
          setMode('WAIT_JUMP');
          decision = 'aimed at me: waiting for a safe moment to jump';
          return keys;
        }
        setMode('WAIT_JUMP');
        decision = `aimed at me: jumping in ${(p.hitMe.t - lead).toFixed(2)}s`;
        return keys;
      }
      // Can't jump right now (in the air, no grapple, or the ground isn't nearest). A low
      // ball follows us if we back away, so hold still and let the safety check find the
      // way out; only step aside from one that's dropping from above.
      const m2 = mpcStep('aimed at me'); if (m2) return m2;
      if (p.hitMe.y >= me.y - CFG.dangerRadius * 0.5) {
        setMode('WAIT_JUMP');
        decision = 'aimed at me: holding for the safety check';
        return keys;
      }
      setMode('DODGE');
      decision = 'aimed at me: stepping aside';
      keys.add(away);
      return keys;
    }

    // Our own clearance to the back wall is flying toward our net on purpose: don't chase
    // it (unless it's really going in), head back to the middle.
    if (lastReleaseTarget === 'backwall' && now - lastReleaseAt < CFG.clearIgnoreMs && !p.hitGoal) {
      setMode('RECOVER');
      decision = 'cleared it to the back wall: back to the middle';
      return balanceTo(home, CFG.positionMaxSpeed);
    }

    // 2. Thrown toward our net (into it, over our head, or going backwards): get under
    //    it and jump up to grab it, using the jump learned for this height and angle.
    if (bi.speed > CFG.incomingSpeed && (p.hitGoal || bi.towardOurNet) && !rollingSlow) {
      setMode('DEFEND');
      // Past us = between us and our net. Chase it down and regrab it from behind.
      const passed = s.side === 'left' ? ball.x < me.x - r : ball.x > me.x + r;
      const why = passed ? 'got past me: regrab' : p.hitGoal ? 'into our net'
                : ball.y < me.y - CFG.dangerRadius ? 'over my head' : 'going backwards';
      if (safe && canGrabBall) { decision = `${why}: grab`; return startThrow('net'); }
      if (tryCopy(s, 'def', now)) { decision = `${why}: copying ${copy.m.from}'s save`; return keys; }
      // Just over our head while we're on the ground: time a low hop so that, once the
      // ball has passed, it's in reach and nearer than the ground - then regrab it.
      if (onFloor && ball.y < me.y - r && Math.abs(dx) < CFG.grappleRange) {
        const pj = planPassJump(s);
        if (pj && pj.wait <= decideDt / 1000 + 0.01 && rested && groundNearest && hasFuel(jumpFuel(pj.type))) {
          decision = `${why}: ${pj.type} hop to catch it as it passes`;
          return startJump(pj.type, null, true, 'defend', bucketFor(brain.apex[pj.type], ball));
        }
        if (pj) {
          setMode('WAIT_JUMP');
          decision = `${why}: ${pj.type} hop in ${pj.wait.toFixed(2)}s to catch it`;
          return keys;
        }
        // No hop can catch it safely: don't run under it or jump into it. Let it pass,
        // then chase it down and regrab it from behind.
        const passing = s.side === 'left' ? ball.x > me.x - r : ball.x < me.x + r;
        if (passing && ball.y > me.y - CFG.grappleRange) {
          setMode('WAIT_JUMP');
          decision = `${why}: letting it pass over, then chasing it`;
          return keys;
        }
      }
      const inReach = passed ? Math.abs(dx) <= CFG.grappleRange
                             : Math.abs(dx) <= CFG.grappleRange && dist <= CFG.grappleRange + CFG.lowJumpReach;
      if (safe && canJump && inReach && hasFuel(jumpFuel('low'))) {
        decision = `${why}: jump + grab`;
        const needH = Math.max(0, (me.y - ball.y) - CFG.grappleRange * 0.7); // rise until it's in reach
        const j = smartJump(needH, null, true, 'defend'); // straight up
        if (j) return j;
        decision = `${why}: no safe jump yet, waiting`;
        return keys;
      }
      if (CFG.mpc && onFloor) {
        const mv = mpcMove(s, now, p, (t) => hasFuel(jumpFuel(t)), null);
        if (mv) {
          decision = `${why}: ${mv.h < 0 ? 'left' : mv.h > 0 ? 'right' : 'staying'} - best future: ` +
                     (mv.plan ? `catch in ${(MPC_HOLD + mv.plan.t).toFixed(2)}s` : 'no catch yet');
          if (mv.h) keys.add(mv.h < 0 ? 'left' : 'right');
          return keys;
        }
      }
      decision = passed ? `${why}: chasing it` : `${why}: getting under it`;
      const lead = Math.min(p.hitGoal ? p.hitGoal.t : CFG.saveLead, CFG.saveLead);
      return moveTo(ball.x + ball.vx * lead);
    }

    // 3. Moving fast away from our net: let it go. (A slow one drifting toward their side
    //    isn't an attack and isn't gone yet: it's ours to play, so carry on below.)
    if (bi.speed > CFG.freeRollSpeed || (bi.speed > CFG.incomingSpeed && !(onFloor && p.closest.d > CFG.dangerRadius &&
        ball.vx * fwdSign(s.side) > 0 && (s.floorY ?? s.bounds.maxY) - ball.y < 80))) {
      setMode('HOLD');
      decision = 'going away from our net: hold still';
      return keys;
    }

    // 4. On the floor on our side and not threatening: jump over it, grab it, and throw
    //    (or do the set-up play if the ramp is marked).
    // (one already rolling away from us toward their side isn't coming for us)
    const rollingAway = (ball.x - me.x) * (ball.vx - me.vx) + (ball.y - me.y) * (ball.vy - me.vy) > 0 &&
                        ball.vx * fwdSign(s.side) > 0;
    if (hyp(ball.vx, ball.vy) > 20 && predictClosest(me, ball).d < CFG.dangerRadius && !rollingAway) {
      setMode('DODGE');
      decision = 'ball rolling into me: stepping aside';
      keys.add(awayFrom(ball.x));
      return keys;
    }
    // A teammate has it (or is clearly closer and it's not going in): leave it to them and
    // get into space for their pass / to cover.
    const mate = tm.holding || (tm.closer && !p.hitGoal ? tm.closer : null);
    if (mate) {
      setMode('SUPPORT');
      decision = `${mate.name} ${tm.holding ? 'has it' : 'is closer'}: giving them space`;
      return balanceTo(clampHalf(mate.x + (mate.x > home ? -110 : 110)), CFG.positionMaxSpeed);
    }
    if (canGrabBall) { decision = 'grab'; return startThrow(setupReady() ? 'backwall' : 'net'); }
    if (CFG.offense && onFloor && tryCopy(s, 'off', now)) { decision = `copying ${copy.m.from}'s shot from the start`; return keys; }
    // Offense: move on the ground to the learned distance from the ball, grapple-jump
    // (low/regular/high - never the super jump, that's for defence) toward it to get above
    // it, regrab it in the air once it's the nearest thing, and release at their net.
    if (!pickupPlan || now - pickupPlan.at > CFG.pickupPlanMs) pickupPlan = choosePickup(s, ball, now);
    const plan = pickupPlan;
    const lo = s.side === 'left' ? s.bounds.minX + CFG.backWallGap : s.midX + CFG.wallMargin;
    const hi = s.side === 'left' ? s.midX - CFG.wallMargin : s.bounds.maxX - CFG.backWallGap;
    const spots = [ball.x - plan.d, ball.x + plan.d].filter((x) => x >= lo && x <= hi);
    const spot = spots.length ? spots.reduce((a, b) => (Math.abs(a - me.x) <= Math.abs(b - me.x) ? a : b)) : ball.x;
    if (Math.abs(spot - me.x) <= CFG.standStill * 2 && Math.abs(me.vx) < 60 && canJump &&
        hasFuel(jumpFuel(plan.t))) {
      // the planned grapple jump if it's safe, else another offense jump that is
      const order = [plan.t, ...CFG.offenseJumps.filter((t) => t !== plan.t)];
      const type = order.find((t) => !jumpHitsBall(s, t, towardBall));
      if (type) {
        decision = `offense: ${type} grapple jump from ${plan.d} away to get above it`;
        pendingPickup = { key: type === plan.t ? plan.key : `${heightBand(s, ball)}|${plan.d}|${type}`, at: now };
        pickupPlan = null;
        return startJump(type, towardBall, true, 'pickup');
      }
    }
    setMode('APPROACH');
    decision = `offense: moving ${plan.d} from the ball for a ${plan.t} grapple jump`;
    return moveTo(spot, 4);
  }

  // Follow the ball's predicted path (assuming we stay put) and note what it reaches.
  function pathInfo(s) {
    const { me, ball } = s;
    const goal = goalFor(s);
    const floor = s.floorY ?? s.bounds.maxY;
    const steps = 45;
    let hitMe = null, hitGoal = null, closest = { d: Infinity, t: 0, x: ball.x, y: ball.y };
    // A ball that's already close but moving AWAY from us isn't aimed at us: it only counts
    // as a hit if it's getting closer (or will come back within the lookahead).
    const d0 = hyp(ball.x - me.x, ball.y - me.y);
    const b1 = ballPos(s, 0.1), leaving = hyp(b1.x - me.x, b1.y - me.y) > d0 + 1;
    let prevD = d0;
    for (let i = 0; i <= steps; i++) {
      const t = (CFG.pathLookahead * i) / steps;
      const bp = ballPos(s, t), bx = bp.x, by = bp.y;
      const d = hyp(bx - me.x, by - me.y);
      if (d < closest.d) closest = { d, t, x: bx, y: by };
      const closing = d < prevD - 0.5 || !leaving;
      prevD = d;
      if (!hitMe && d < CFG.dangerRadius && (closing || d < CFG.playerRadius + (s.ballR || 10) + CFG.killMargin)) {
        hitMe = { t, x: bx, y: by };
      }
      if (!hitGoal && (inNet(s, bx, by, 'ours') || (CFG.goal && goal && hyp(bx - goal.x, by - goal.y) < CFG.goalRadius))) hitGoal = { t, x: bx, y: by };
      if (by > floor + 30 || bx < s.bounds.minX - 30 || bx > s.bounds.maxX + 30) break;
    }
    return { hitMe, hitGoal, closest };
  }

  // A marked spot, mirrored if we've switched sides since it was marked.
  const mirrored = (g, s) => (!g ? null : g.side === s.side ? { x: g.x, y: g.y } : { x: BONK_W - g.x, y: g.y });
  const goalFor = (s) => (CFG.goal ? mirrored(CFG.goal, s) : netCenter(s, 'ours'));
  const rampFor = (s) => mirrored(CFG.ramp, s);
  // Where the ball will first come down (x), following its free flight; null if it doesn't.
  function landingX(s) {
    const { ball } = s;
    const floor = s.floorY ?? s.bounds.maxY;
    for (let i = 1; i <= 60; i++) {
      const t = (2.5 * i) / 60;
      const bp = ballPos(s, t), bx = bp.x, by = bp.y;
      if (by >= floor) return Math.max(s.bounds.minX, Math.min(s.bounds.maxX, bx));
    }
    return null;
  }

  // A ball passing just over us: find the earliest safe low/regular hop (possibly after
  // waiting a moment) during which the ball is in reach and nearer than the ground.
  function planPassJump(s) {
    const { me, ball } = s;
    const floor = s.floorY ?? s.bounds.maxY;
    const br = s.ballR || 10;
    for (let w = 0; w <= CFG.safetyMaxWait + 1e-9; w += CFG.safetyWaitStep) {
      for (const type of ['low', 'regular']) {
        if (jumpClearance(s, type, null, w) < CFG.jumpSafety) continue;
        const h = brain.apex[type], lift = brain.lift[type] / 1000, air = brain.air[type] / 1000;
        for (let i = 1; i <= 12; i++) {
          const tj = lift + (air * i) / 13, t = w + tj, u = (tj - lift) / air;
          const my = me.y - h * 4 * u * (1 - u), mx = me.x + me.vx * t;
          const bp = ballPos(s, t), bx = bp.x, by = bp.y;
          const bd = hyp(bx - mx, by - my) - br, gd = floor - my;
          if (bd >= CFG.grabMin && bd <= CFG.grappleRange && bd + CFG.nearestMargin < gd) return { wait: w, type };
        }
      }
    }
    return null;
  }

  // Where a released ball will come down within our reach on our side (a little behind
  // that point), or null if it goes over everything.
  function readSpot(s) {
    const { ball } = s;
    const floor = s.floorY;
    if (floor == null || !ball) return null;
    const reachTop = floor - brain.apex.super - CFG.grappleRange * 0.5;
    for (let i = 1; i <= 45; i++) {
      const t = (CFG.pathLookahead * i) / 45;
      const bp = ballPos(s, t), px = bp.x, py = bp.y;
      if (py > floor + 10) break;
      if (onOurSide(s, px) && py >= reachTop) return px - fwdSign(s.side) * CFG.readBack;
    }
    return null;
  }

  // Counter ('meet' stance): the earliest point on the ball's path on our side where it's
  // low enough to reach, a little behind it.
  function meetSpot(s) {
    const { ball } = s;
    const floor = s.floorY;
    if (floor == null || !ball) return null;
    const reachTop = floor - brain.apex.high - CFG.grappleRange * 0.5;
    for (let i = 1; i <= 45; i++) {
      const t = (CFG.pathLookahead * i) / 45;
      const bp = ballPos(s, t), px = bp.x, py = bp.y;
      if (py > floor + 10) break;
      if (onOurSide(s, px) && Math.abs(px - s.midX) > CFG.wallMargin + 20 && py >= reachTop) {
        return px - fwdSign(s.side) * CFG.readBack;
      }
    }
    return null;
  }

  // Where to set up an attack: the marked ramp, or else the spot the opponent's most
  // dangerous throws came from (copied onto our side).
  function setupSpot(s) {
    const ramp = rampFor(s);
    if (ramp) return ramp;
    const good = brain.plays.filter((q) => q.source !== 'mine' && q.score > CFG.playMinScore && q.dist != null);
    if (!good.length) return null;
    const best = good.reduce((a, b) => (b.score > a.score ? b : a));
    return { x: s.midX - fwdSign(s.side) * best.dist, y: (s.floorY ?? s.bounds.maxY - 40) - (best.height || 0) };
  }

  // Our back wall, where the set-up throw is aimed.
  function backWallPoint(s) {
    const floor = s.floorY ?? s.bounds.maxY - 40;
    return { x: s.side === 'left' ? s.bounds.minX + 5 : s.bounds.maxX - 5, y: floor - CFG.backWallHeight };
  }

  // Where to wait: the middle of our half, or waitFromBarrier units from the barrier.
  function waitSpot(s) {
    const d = CFG.waitFromBarrier ?? (s.side === 'left' ? s.midX - s.bounds.minX : s.bounds.maxX - s.midX) / 2;
    const middle = s.side === 'left' ? s.midX - d : s.midX + d;
    const fwd = fwdSign(s.side);
    const back = s.side === 'left' ? s.bounds.minX + CFG.backWallGap : s.bounds.maxX - CFG.backWallGap;
    switch (stance) {
      case 'forward': return middle + fwd * d * CFG.stanceForward;           // closer to the barrier
      case 'deep':    return middle + (back - middle) * CFG.stanceDeep;       // closer to our net
      case 'shadow': { // where their throws usually come down on our side
        if (brain.landAvg == null) return middle;
        const x = s.midX - fwd * brain.landAvg;
        return s.side === 'left' ? Math.max(back, Math.min(s.midX - CFG.wallMargin, x))
                                 : Math.min(back, Math.max(s.midX + CFG.wallMargin, x));
      }
      case 'copied': { // where the good players we've watched wait
        const x = s.midX - fwd * brain.posLearn.d;
        return s.side === 'left' ? Math.max(back, Math.min(s.midX - CFG.wallMargin, x))
                                 : Math.min(back, Math.max(s.midX + CFG.wallMargin, x));
      }
      default:        return middle;                                          // 'middle' and 'meet'
    }
  }

  // ---- Stances: where to wait for their throw. Middle is the default; it also tries
  //      forward (closer to the barrier), deep (closer to our net), shadow (where their
  //      throws usually land) and - once its saves are reliable - meet (a counter: go to
  //      meet the ball early on its path, grab it and send it straight back). Each is
  //      scored by how the saves from it went; it picks the best most of the time and
  //      tries others, more often when it's being too predictable.
  let stance = 'middle';
  let stanceActive = null; // the stance being scored for the current incoming throw
  function counterUnlocked() {
    const r = brain.review, n = r.goodSaves + r.badSaves;
    return r.goodSaves >= CFG.counterUnlockSaves && n > 0 && r.goodSaves / n >= CFG.counterUnlockRate;
  }
  function chooseStance(s) {
    const opts = ['middle', 'forward', 'deep'];
    if (brain.landAvg != null) opts.push('shadow');
    if (brain.posLearn.d != null && brain.posLearn.n > 40) opts.push('copied'); // where the good players wait
    if (counterUnlocked()) opts.push('meet');
    // Middle is the default. Another stance only takes over once it's been tried enough and
    // has clearly done better (saves are noisy, so one bad one mustn't make it wander off).
    const st = (k) => brain.stances[k] || { score: 0, n: 0 };
    let best = 'middle';
    for (const k of opts) {
      if (k === 'middle') continue;
      const v = st(k);
      if (v.n >= CFG.stanceMinTries && v.score > st(best).score + CFG.stanceMargin) best = k;
    }
    const explore = Math.max(CFG.stanceExplore, unpredictability(s) * 0.5);
    const others = opts.filter((k) => k !== best);
    stance = Math.random() < explore && others.length ? others[Math.floor(Math.random() * others.length)] : best;
    stanceActive = stance;
    readDelay = [0, 0.08, 0.16][Math.floor(Math.random() * 3)] * (stance === 'middle' ? 0 : 1); // varied timing
  }
  function stanceResult(r) {
    if (!stanceActive) return;
    const st = (brain.stances[stanceActive] = brain.stances[stanceActive] || { score: 0, n: 0 });
    st.score += CFG.learnRate * (r - st.score);
    st.n++;
    stanceActive = null;
    saveBrain();
  }
  let readDelay = 0;
  let lastBallHere = false;
  let incomingSince = 0;

  function mapSummary(s) {
    const m = s.map || [];
    if (!m.length) return `rough (${(s.shapes || []).length} boxes, no exact shapes seen yet)  ball bounce ${brain.map.bounce.toFixed(2)}`;
    const polys = m.filter((q) => q.type === 'poly'), circ = m.length - polys.length;
    const slopes = polys.filter((q) => q.pts.some((p, i) => {
      const n = q.pts[(i + 1) % q.pts.length];
      const dx = Math.abs(n[0] - p[0]), dy = Math.abs(n[1] - p[1]);
      return dx > 3 && dy > 3; // an edge that's neither flat nor upright
    })).length;
    return `${m.length} solid pieces (${slopes} with slopes/ramps, ${circ} round)  ` +
           `ball bounce ${brain.map.bounce.toFixed(2)} (from ${brain.map.bounces} bounces), rolling friction ${brain.map.slide.toFixed(3)}`;
  }

  // Draw what the bot thinks the map is (and the ball's predicted flight) over the game.
  let overlay = null;
  function drawOverlay(s) {
    if (!CFG.showMap || !s) { if (overlay) overlay.style.display = 'none'; return; }
    const r = document.getElementById('gamerenderer');
    const c = r && r.querySelector('canvas');
    if (!c || !document.body) return;
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99998';
      document.body.appendChild(overlay);
    }
    const rect = c.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px'; overlay.style.top = rect.top + 'px';
    overlay.width = rect.width; overlay.height = rect.height;
    const k = rect.width / BONK_W, g = overlay.getContext('2d');
    g.clearRect(0, 0, overlay.width, overlay.height);
    g.lineWidth = 2;
    for (const sh of solidShapes(s)) {
      g.strokeStyle = 'rgba(0,255,120,0.9)';
      g.beginPath();
      if (sh.type === 'circle') g.arc(sh.x * k, sh.y * k, sh.r * k, 0, Math.PI * 2);
      else sh.pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
      g.closePath(); g.stroke();
    }
    if (s.ball) {
      g.strokeStyle = 'rgba(255,60,60,0.9)';
      g.beginPath();
      ballFlight(s).forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)));
      g.stroke();
    }
    if (s.me) {
      g.strokeStyle = 'rgba(80,160,255,0.9)';
      g.beginPath(); g.arc(s.me.x * k, s.me.y * k, CFG.grappleRange * k, 0, Math.PI * 2); g.stroke();
    }
  }

  // ---------------- LOOP + UI ----------------
  let enabled = false;
  let teach = false;            // F3: you're teaching (you play, it watches)
  const userHeld = new Set();   // the keys you're holding right now
  let panel = null;

  function render(text) {
    if (!panel) {
      if (!document.body) return;
      panel = document.createElement('div');
      panel.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:99999;padding:6px 10px;white-space:pre;' +
        'font:12px monospace;color:#fff;background:rgba(0,0,0,.65);border-radius:6px;pointer-events:none';
      document.body.appendChild(panel);
      try { makeButtons(); } catch (e) { /* no buttons: the console helpers still work */ }
    }
    if (bindPrompt) { panel.textContent = `WDB bot: ${bindPrompt}`; return; }
    if (enabled && noKeys()) { panel.textContent = `WDB bot: ON - NO KEYS SET: press ${CFG.bindKey} to set your keys (it can't play or learn from you until then)`; return; }
    // Small by default: just on/off and what it's doing. F4 shows the full learning panel.
    const lines = String(text).split('\n');
    panel.textContent = CFG.panelFull
      ? `WDB bot [${CFG.toggleKey}]: ${enabled ? 'ON' : 'OFF'}  (${CFG.panelKey}: less)\n${text}`
      : `WDB bot: ${enabled ? 'ON' : 'OFF'}${enabled && lines[0] ? '  ' + lines[0].slice(0, 110) : ''}` +
        (enabled && grabClock && wasAlive ? `  [ball clock ${((performance.now() - grabClock.at) / 1000).toFixed(1)}s]` : '');
    if (buttons && buttons.style) buttons.style.display = CFG.panelFull ? 'flex' : 'none';
  }

  const r0 = (n) => Math.round(n);

  // ---- Saving / moving what it's learned: Export downloads it as a file, Import loads one
  //      (back it up, move it to another computer, or send it over to be looked at).
  function exportBrain(download) {
    try { if (ML.Q) mlSave(); } catch (e) { /* ignore */ }
    const json = JSON.stringify(brain);
    if (download && document.body) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `wdb-brain-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    lastLesson = `brain exported (${Math.round(json.length / 1024)} KB)`;
    return json;
  }
  function importBrain(data) {
    try {
      if (!adoptBrain(typeof data === 'string' ? JSON.parse(data) : data)) throw new Error("that isn't a WDB brain file");
      mlRestart();
      saveNow();
      lastLesson = 'brain imported';
      return true;
    } catch (e) { lastLesson = `import failed: ${e.message}`; return false; }
  }
  let buttons = null;
  function makeButtons() {
    if (buttons || !document.body) return;
    buttons = true; // only try once
    buttons = document.createElement('div');
    buttons.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;display:flex;gap:6px';
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:12px monospace;padding:3px 8px;border-radius:5px;border:1px solid #888;' +
                        'background:rgba(0,0,0,.7);color:#fff;cursor:pointer';
      b.addEventListener('click', () => { fn(); b.blur(); });
      buttons.appendChild(b);
    };
    btn('Set my keys', () => startBinding('you'));
    btn("Set bot's keys", () => startBinding('bot'));
    btn('Export brain', () => exportBrain(true));
    btn('Import brain', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) f.text().then(importBrain); };
      inp.click();
    });
    document.body.appendChild(buttons);
  }

  // Your real keys (the bot's own key presses are synthetic and ignored here).
  const keyNameOf = (e) => {
    for (const [n, k] of Object.entries(KEYS)) if (k && e.code && e.code === k.code) return n;
    for (const [n, k] of Object.entries(KEYS)) if (k && !e.code && e.keyCode === k.keyCode) return n;
    return null;
  };
  window.addEventListener('keydown', (e) => {
    if (bindingKey(e)) return;
    if (e.isTrusted && e.key === CFG.bindKey) { startBinding('you'); e.preventDefault(); return; }
    if (e.isTrusted && e.key === CFG.botBindKey) { startBinding('bot'); e.preventDefault(); return; } // (also stops F5 reloading the page)
    if (e.isTrusted && e.key === CFG.panelKey) { CFG.panelFull = !CFG.panelFull; e.preventDefault(); return; }
    if (e.isTrusted && e.key === CFG.teachKey) { // F3: teaching - it stays on but you play
      teach = !teach;
      if (teach) { enabled = true; releaseAll(); setMode('TEACH'); lastLesson = 'TEACHING: you play, I watch and memorize'; }
      else { setMode('IDLE'); lastLesson = 'teaching off: I play again'; }
      ML.prevG = false; ML.grabTry = null; ML.hold = null; ML.replay = null;
      e.preventDefault(); return;
    }
    if (e.isTrusted) { const n = keyNameOf(e); if (n) userHeld.add(n); }
    if (!e.isTrusted || e.key !== CFG.toggleKey) return; // ignore our own synthetic keys
    enabled = !enabled;
    if (!enabled) { releaseAll(); setMode('IDLE'); teach = false; }
    e.preventDefault();
  }, true);
  window.addEventListener('keyup', (e) => { if (e.isTrusted) { const n = keyNameOf(e); if (n) userHeld.delete(n); } }, true);
  window.addEventListener('blur', () => userHeld.clear());

  const meterText = () => {
    const n = Math.round((fuel / CFG.grappleMaxMs) * 10);
    return `${'#'.repeat(n)}${'.'.repeat(10 - n)} ${(fuel / 1000).toFixed(1)}s${fuelLocked ? ' RECHARGING' : ''}`;
  };

  // How fast are we really running? (the bot's own ticks, and the game's drawn frames)
  const fps = { ticks: 0, frames: 0, at: performance.now(), bot: 0, game: 0 };
  let lastSig = '', lastDecideAt = 0;
  if (typeof requestAnimationFrame === 'function') {
    const countFrame = () => { fps.frames++; requestAnimationFrame(countFrame); };
    requestAnimationFrame(countFrame);
  }
  let renderAt = -1e9, botErrors = 0, botLastError = '';
  const renderDue = (now) => { if (now - renderAt < 1000 / CFG.panelHz) return false; renderAt = now; return true; };
  function botTick() {
    const now = performance.now();
    if (now - fps.at >= 1000) {
      fps.bot = Math.round(fps.ticks * 1000 / (now - fps.at));
      fps.game = Math.round(fps.frames * 1000 / (now - fps.at));
      fps.ticks = 0; fps.frames = 0; fps.at = now;
    }
    updateFuel(now);
    const s = readState(); // keep sampling even when off, so speeds are ready
    if (s) { s.players = s.players || []; s.enemies = s.enemies || []; }
    if (s && s.side && !CFG.goal) s.enemyGoal = netCenter(s, 'theirs'); // aim at their real net
    if (!enabled) {
      if (renderDue(now)) render(s ? `ready | tracking ${s.players.length} other player(s), ${s.enemies.length} enemy` : waitReason);
      return;
    }
    // Synced to the game: only decide when the game has actually moved something since our
    // last decision (no point re-deciding on the same picture), at most every tickMs.
    if (s && s.me && !s.spectating) {
      const sig = `${s.me.x},${s.me.y},${s.ball ? s.ball.x + ',' + s.ball.y : '-'}`;
      const since = now - lastDecideAt;
      if ((!CFG.ml && since < CFG.tickMs * 0.9) || (sig === lastSig && since < 50)) { refreshKeys(now); return; }
      decideDt += 0.2 * (Math.min(100, since) - decideDt);
      lastSig = sig; lastDecideAt = now;
    }
    fps.ticks++;
    if (!s || s.spectating) { // dead or between rounds: position again next round
      if (wasAlive) {
        // Really died (the ball was right on us), or the round just ended around us?
        const died = !(CFG.ml || teach) || (ML.lastBallD ?? 0) < CFG.mlDeathDist;
        if (died) {
          learnDeath(); offenseDeath(); reviewDeath();
          if (copy) { copyResult(copy, 0, 'died'); copy = null; }
          judgeKickoffDeath();
        }
        if (CFG.ml || teach) mlTerminal(died ? CFG.mlRewardDeath : 0);
        if (died) mlVerdict('death', false);
        grabClock = null; // the ball clock starts over next round
        kickEp = null;
      }
      wasAlive = false;
      if (ML.rd) ML.rd.alive = false;
      positioned = false; positionStart = 0;
      releaseAll(); setMode('DEAD');
      if (s) { // still watching the game: keep learning from everyone
        curS = s;
        if (!CFG.ml) learnBounces(s);
        readOpponentInputs(s, now);
        offenseTick(s, now);
        if (!CFG.ml) watchOpponentJumps(s, now);
        watchTeammateThrows(s, now);
        watchDefense(s, now);
        watchKickoffs(s, now);
        watchDeaths(s);
        watchPositions(s, now);
        watchPasses(s, now);
        if (CFG.ml || teach) { mlWatch(s, now); mlFlush(now); }
        if (renderDue(now)) render(`DEAD - watching and learning (${s.players.length} players)\n` +
               `last lesson: ${lastLesson || '-'}\nself-review: ${reviewText()}`);
      } else if (renderDue(now)) render(waitReason);
      return;
    }
    wasAlive = true;
    if (CFG.ml || teach) return mlTick(s, now);
    if (!mlRoundLive(s, now)) { // the countdown: don't move (or replay anything) until the round begins
      setKeys(new Set()); setMode('WAIT');
      if (renderDue(now)) render('waiting for the countdown to end');
      return;
    }
    learnTick(s, now);
    airLearnTick(s, now);
    learnMyMovement(s, now);
    readOpponentInputs(s, now);
    offenseTick(s, now);
    watchOpponentJumps(s, now);
    watchTeammateThrows(s, now);
    watchDefense(s, now);
    watchKickoffs(s, now);
    watchDeaths(s);
    watchPositions(s, now);
    watchPasses(s, now);
    passTick(s, now);
    grabClockTick(s, now);
    reviewTick(s, now);
    kickoffTick(s, now);
    curS = s;
    learnBounces(s);
    let keys = decide(s);
    keys = safetyLayer(s, keys, now); // the ball kills: never let a move carry us into it
    if (s.ball) { // is the ball actually coming for us, or are we free to move?
      const q = pathInfo(s), bi = s.ballInfo;
      threatText = q.hitMe ? `AIMED AT ME (in ${q.hitMe.t.toFixed(2)}s)`
        : q.hitGoal ? `GOING IN our net at this speed (in ${q.hitGoal.t.toFixed(2)}s, at y ${r0(q.hitGoal.y)})`
        : bi && bi.towardOurNet && bi.speed > CFG.incomingSpeed ? "coming our way (won't reach the net at this speed)"
        : 'none - not being attacked, free to move';
    } else threatText = '-';
    if (mode === 'THROW' && s.ball) { // record our own shot (in the left-side frame)
      const mir = s.side === 'right';
      const L = keys.has('left'), R = keys.has('right');
      ownFrames.push({
        k: bits({ l: mir ? R : L, r: mir ? L : R, u: keys.has('up'), d: keys.has('down'), g: keys.has('grapple'), h: keys.has('heavy') }),
        bx: Math.round((s.ball.x - s.me.x) * (mir ? -1 : 1)), by: Math.round(s.ball.y - s.me.y), t: now,
      });
      while (ownFrames.length && now - ownFrames[0].t > 6000) ownFrames.shift(); // last 6 s
    }
    // Locked in the middle while the ball is on their side: only up/down and grapple.
    // (left/right are used for balancing in the middle, so they're no longer locked)
    if (keys.has('grapple') && fuelLocked) keys.delete('grapple'); // meter is empty
    setKeys(keys);
    refreshKeys(now);

    const modeText = mode === 'JUMP' ? `JUMP (${jump.type}, ${jump.label})` : mode;
    if (!renderDue(now)) return;
    if (!CFG.panelFull) { render(`${modeText}${decision ? ' - ' + decision : ''}`); return; }
    const ap = brain.apex;
    const inReach = lastRadar.length
      ? lastRadar.slice(0, 3).map((c) => `${c.kind} ${r0(c.d)}`).join(', ')
      : 'nothing in reach';
    const bi = s.ballInfo;
    const ballText = s.ball
      ? `height ${r0(bi.height)}  speed ${r0(bi.speed)}  angle ${r0(bi.angle)}deg  ` +
        `${bi.towardOurNet ? 'TOWARD OUR NET' : 'away from our net'}${bi.rising ? ', rising' : ', falling'}` +
        `  (${onOurSide(s, s.ball.x) ? 'our side' : 'their side'})`
      : 'not moving yet';
    const spot = (g) => (g ? `(${g.x}, ${g.y})` : 'NOT SET');
    render(
      `${modeText}${decision ? ' - ' + decision : ''}\n` +
      `ball: ${ballText}\n` +
      `grapple: ${meterText()} | would grab: ${inReach}` +
      `${s.ball ? ` | ball clearance: ${lastClearance === Infinity ? '-' : Math.round(lastClearance)}` : ''}\n` +
      `me (${r0(s.me.x)}, ${r0(s.me.y)})  side: ${s.side}  floor: ${s.floorY == null ? 'learning...' : r0(s.floorY)}  ` +
      `gravity: ${r0(s.gravity)}\n` +
      `aim: their net (${r0(s.enemyGoal.x)}, ${r0(s.enemyGoal.y)})  ` +
      `goal: ${CFG.goal ? spot(CFG.goal) + ' (marked by hand)' : 'the net gap (auto)'}  ramp: ${spot(CFG.ramp)}${CFG.ramp ? '' : ' - WDB.markRamp()'}\n` +
      `jumps learned (height / lift-off ms): ` +
      JUMP_ORDER.map((t) => `${t} ${r0(ap[t])}/${r0(brain.lift[t])}`).join('  ') +
      `  (${brain.jumps} jumps measured, ${brain.imitated || 0} opponent jumps copied)\n` +
      `regrabs ${brain.regrab.wins}/${brain.regrab.tries}  throw power x${brain.throwPower.toFixed(2)}  ` +
      `offense regrab: ${(() => {
        const e = Object.entries(brain.pickups);
        if (!e.length) return 'learning';
        const [k, v] = e.reduce((a, b) => (b[1] > a[1] ? b : a));
        return `best ${k.replace(/\|/g, '/')} (${v.toFixed(2)}, ${brain.pickupTries} tries)`;
      })()}  ` +
      `offense ${CFG.offense ? 'ON' : 'OFF (still learning)'}: ${brain.plays.length} throws learned (${brain.plays.filter((q) => q.source !== 'mine').length} copied), ` +
      `best: ${(() => { const b = brain.plays.reduce((a, q) => (!a || q.score > a.score ? q : a), null);
        return b ? `${Math.round(b.angle * -57.3)}deg ${Math.round(b.speed)} speed, score ${b.score.toFixed(2)}` +
          (b.from ? ` (from ${b.from})` : '') : 'none yet'; })()}` +
      `${watchThrow ? `  | watching ${watchThrow.play.from}'s throw` : ''}\n` +
      `reading: ${[...oppTrack].map(([n, o]) => {
        const k = o.last;
        if (!k) return `${n} -`;
        const t = [k.l && 'left', k.r && 'right', k.u && 'up', k.d && 'down', k.h && 'HEAVY', k.g && 'GRAPPLE'].filter(Boolean);
        return `${n} ${t.join('+') || 'nothing'}`;
      }).join(' | ') || 'no opponents'}\n` +
      `shots recorded: ${brain.moves.length}` +
      `${brain.moves.length ? ` (best ${brain.moves.reduce((a, q) => (q.score > a.score ? q : a)).from}, ` +
        `score ${brain.moves.reduce((a, q) => (q.score > a.score ? q : a)).score.toFixed(2)})` : ''}` +
      `  my push: ground ${r0(brain.move.groundAx)} air ${r0(brain.move.airAx)} gravity ${r0(brain.move.g)}\n` +
      `copies: ${brain.moves.length} shots, ${brain.defMoves.length} saves, ${brain.kickMoves.length} kickoffs watched` +
      `  (used ${brain.copyStats.tries}x, grabbed ${brain.copyStats.grabs}x)  heavy pull ${r0(brain.move.heavyAy)} vs down ${r0(brain.move.downAy)}\n` +
      `speed: ${fps.bot} decisions/s, synced to the game's updates (max ${Math.round(1000 / CFG.tickMs)})` +
      `${fps.game ? `, game drawing ${fps.game} fps` : ''}` +
      `${fps.bot && fps.bot < 20 ? '  (SLOW: keep the game tab in front / close other tabs)' : ''}\n` +
      `field: net y ${r0(field(s).net.y0)}-${r0(field(s).net.y1)} behind x ${r0(field(s).net.x)} (${field(s).net.found ? 'found on the map' : 'standard WDB layout'}), ` +
      `back ramp x ${field(s).backRamp.join('-')}, center ramp x ${field(s).centerRamp.join('-')} (left side; mirrored)\n` +
      `brain: ${CFG.planner ? 'PLANNER (no rules)' : 'rules'}  | save plan: ${planText}  | future-scoring ${CFG.mpc ? 'ON' : 'off'}, pro moments remembered: ${(brain.knn || []).length}\n` +
      `grapple holds: ${(() => { const b = bestHold(); return b ? `~${b.ms}-${b.ms + 250} ms gets throws over best (${Math.round(b.rate * 100)}%, ${b.n} seen)` : 'learning'; })()}` +
      `${brain.posLearn.d != null ? `  | good players wait ${r0(brain.posLearn.d)} from the barrier` : ''}\n` +
      `players: ${[...oppTrack].map(([n, o]) => o.x == null ? '' :
        `${n} (${r0(o.x)}, ${r0(o.y)})${o.holdAt && performance.now() - o.holdAt < 100 ? ` rope ${r0(o.holdDist)} held ${((o.holdAt - o.holdStart) / 1000).toFixed(1)}s` : ''} grapple ~${((o.fuel ?? CFG.grappleMaxMs) / 1000).toFixed(1)}s`)
        .filter(Boolean).join(' | ') || 'none'}\n` +
      `super jump angle (left/right + X+Z): ${r0(brain.superSide.v)} sideways (${brain.superSide.n} measured)  | ` +
      `air moves (learned): tap +${r0(brain.airMoves.boost.h)} (${brain.airMoves.boost.n}x), balloon drift ${r0(brain.airMoves.balloonVy.v)}/s (${brain.airMoves.balloonVy.n}x), ` +
      `super from balloon +${r0(brain.airMoves.super.h)} (${brain.airMoves.super.n}x)  | shots remembered: ${Object.keys(brain.shotMem).length}\n` +
      `threat: ${threatText}${swingRead.spot ? `  | reading ${swingRead.spot.from}'s swing -> x ${r0(swingRead.spot.x)} (+-${r0(swingRead.spot.spread)})` : ''}` +
      `${shotState.last != null && mode === 'THROW' ? `  | shot now: ${shotState.last.toFixed(2)}` : ''}\n` +
      `players (copied most from the best): ${Object.entries(brain.skill).filter(([, r]) => r.g + r.b >= 2)
        .sort((a, b) => skillOf(b[0]) - skillOf(a[0])).slice(0, 4)
        .map(([n, r]) => `${n} ${Math.round(skillOf(n) * 100)}% (${r.g + r.b})`).join(', ') || 'rating them as it watches'}\n` +
      `last lesson: ${lastLesson || '-'}\n` +
      `self-review: ${reviewText()}\n` +
      `map: ${mapSummary(s)}\n` +
      `stance: ${stance}  (${Object.entries(brain.stances).map(([k, v]) => `${k} ${v.score.toFixed(2)}`).join(', ') || 'learning'})` +
      `  counter: ${counterUnlocked() ? 'UNLOCKED' : `locked until ${CFG.counterUnlockSaves} good saves at ${Math.round(CFG.counterUnlockRate * 100)}%`}\n` +
      `aim: net ${brain.targets.net.wins}/${brain.targets.net.tries}, player ${brain.targets.player.wins}/${brain.targets.player.tries}` +
      `  unpredictable: ${Math.round(unpredictability(s) * 100)}%` +
      `${s.enemies.length ? ' (' + s.enemies.map((e) => {
        const a = brain.vs[e.name] || [];
        return `vs ${e.name}: ${a.filter(Boolean).length}/${a.length} shots worked`;
      }).join(', ') + ')' : ''}`
    );
  }
  // The loop: the learning brain only needs to look ~40 times a second (the game updates ~30),
  // the old brain looks faster, and when the bot is off it just keeps its readings warm.
  if (CFG.ml) mlInit();
  (function loop() {
    try { botTick(); } catch (e) {
      botErrors++; botLastError = String(e && e.stack || e);
      if (botErrors < 5) console.warn('WDB bot error:', e);
    }
    setTimeout(loop, !enabled ? 100 : CFG.ml ? 1000 / CFG.mlHz : CFG.pollMs);
  })();

  // Console helpers
  const WDB = {
    CFG,
    setStateProvider(fn) { stateProvider = fn; },
    get mode() { return mode; },
    get errors() { return { count: botErrors, last: botLastError }; },
    get ml() { return ML; },
    get teaching() { return teach; },
    setKeys() { startBinding('you'); return 'press each key when the panel asks (Esc keeps the current one)'; },
    setBotKeys() { startBinding('bot'); return 'press each key the bot should use when the panel asks (Esc keeps the current one)'; },
    resetBotKeys() { try { releaseAll(); } catch (e) { /* ignore */ } BOT_KEYS = {}; try { localStorage.removeItem(BOT_BIND_KEY); } catch (e) { /* ignore */ } console.log('WDB: the bot uses your keys again'); },
    keys() { console.log(`WDB keys (${bindSource}): ${bindsText()}`); return JSON.parse(JSON.stringify(KEYS)); },
    resetKeys() { try { releaseAll(); } catch (e) { /* ignore */ } for (const n of Object.keys(KEYS)) KEYS[n] = null; try { localStorage.removeItem(BIND_KEY); } catch (e) { /* ignore */ } bindSource = `NOT SET - press ${CFG.bindKey}`; console.log(`WDB: keybinds cleared - press ${CFG.bindKey} to set them`); },
    teach(on = !teach) { teach = !!on; if (teach) { enabled = true; releaseAll(); } ML.prevG = false; ML.grabTry = null; ML.hold = null; ML.replay = null; return teach; },
    pressKey(name, down) { if (down) userHeld.add(name); else userHeld.delete(name); }, // (for testing teaching without a keyboard)
    moves() { // the moves you've taught it
      const out = clips().map((c, i) => ({ i, kind: c.kind, from: c.why, worked: c.good, sec: +(c.dur / 1000).toFixed(1),
        keyChanges: c.keys.length, score: +c.score.toFixed(2), replays: c.n || 0, replaysWorked: c.wins || 0 }));
      console.table(out); return out;
    },
    forgetMoves() { brain.clips = []; saveBrain(); console.log('WDB: taught moves forgotten.'); },
    map() {
      const m = mapModel.map((q) => q.type === 'circle'
        ? { circle: [Math.round(q.x), Math.round(q.y)], r: Math.round(q.r) }
        : { outline: q.pts.map(([x, y]) => [Math.round(x), Math.round(y)]) });
      console.log(`WDB map: ${m.length} solid pieces (${mapFromGeometry ? 'exact shapes' : 'none yet'}), ` +
                  `ball bounce ${brain.map.bounce.toFixed(2)}`, m);
      return m;
    },
    showMap(on = true) { CFG.showMap = !!on; console.log(`WDB: map overlay ${on ? 'ON (green = map, red = ball flight, blue = grapple reach)' : 'off'}`); },
    brain() { console.log('WDB learned:', JSON.parse(JSON.stringify(brain))); return brain; },
    exportBrain() { return exportBrain(true); },
    players() { // every player: position, rope, how long they've held it, grapple left (estimate)
      const out = [...oppTrack].map(([name, o]) => ({ name, x: Math.round(o.x), y: Math.round(o.y),
        holding: !!(o.holdAt && performance.now() - o.holdAt < 100), rope: o.holdDist ? Math.round(o.holdDist) : null,
        heldSec: o.holdStart && o.holdAt ? +((o.holdAt - o.holdStart) / 1000).toFixed(2) : 0,
        grappleLeftSec: +((o.fuel ?? CFG.grappleMaxMs) / 1000).toFixed(1) }));
      console.table(out); return out;
    },
    importBrain(json) { const ok = importBrain(json); console.log(`WDB: ${lastLesson}`); return ok; },
    forget() {
      brain = freshBrain();
      try { localStorage.removeItem(BRAIN_KEY); } catch (e) { /* ignore */ }
      mlRestart();
      console.log('WDB: learning reset.');
    },
    meter() { return meterText(); },
    markGoal() {
      const s = readState();
      const me = s ? s.me : null;
      if (!me) { console.log('WDB: start a round and stand in front of your goal first.'); return; }
      CFG.goal = { side: me.x < CFG.midX ? 'left' : 'right', x: Math.round(me.x), y: Math.round(me.y) };
      console.log('WDB: goal set to', CFG.goal, '(mirrored automatically if you switch sides)');
    },
    markRamp() {
      const s = readState();
      if (!s) { console.log('WDB: start a round and stand on the ramp near your goal first.'); return; }
      CFG.ramp = { side: s.side, x: Math.round(s.me.x), y: Math.round(s.me.y) };
      console.log('WDB: ramp set to', CFG.ramp, '(mirrored automatically if you switch sides)');
    },
    markWait() {
      const s = readState();
      if (!s) { console.log('WDB: start a round first.'); return; }
      CFG.waitFromBarrier = Math.round(Math.abs(s.me.x - CFG.midX));
      console.log('WDB: will wait', CFG.waitFromBarrier, 'units from the barrier');
    },
    debug() {
      const s = readState();
      console.log('WDB state:', s || waitReason, '| circles tracked:', circles.size, '| name:', myName());
      return s;
    },
    // Diagnostics: run WDB.scan() in the console WHILE THE BALL IS MOVING.
    async scan() {
      const PIXI = window.PIXI;
      const hookedOk = !!(PIXI && PIXI.Graphics && PIXI.Graphics.prototype.drawCircle.__wdbHooked);
      const root = currentRoot();
      console.log(`WDB scan | PIXI found: ${!!PIXI} | hook on: ${hookedOk} | hook re-attached ${rehooks}x | ` +
                  `PIXI swapped ${pixiSwaps}x | your name: ${myName()} | found you: ${root ? 'yes' : 'NO'}`);

      // Which games (roots) the bot has seen players in
      const roots = new Map();
      for (const g of circles) {
        if (g.destroyed || !g.parent) continue;
        const n = nameOf(g);
        if (!n) continue;
        const r = rootOf(g);
        if (!roots.has(r)) roots.set(r, new Set());
        roots.get(r).add(n + (g.worldVisible ? '' : ' (hidden)'));
      }
      console.log('Games seen (the one marked CURRENT is what the bot uses):');
      console.table([...roots].map(([r, names]) => ({
        current: r === root ? 'CURRENT' : '', players: [...names].join(', '),
      })));
      if (!root) {
        console.log("WDB scan: can't find your player in the game on screen. Start a round, then scan again.");
        return;
      }

      const scale = canvasScale();
      const all = [];
      (function walk(o, depth) {
        all.push({ o, depth });
        if (o.children) for (const c of o.children) walk(c, depth + 1);
      })(root, 0);
      const pos = (o) => { try { const p = o.getGlobalPosition(); return { x: p.x / scale, y: p.y / scale }; } catch (e) { return null; } };
      const before = all.map(({ o }) => pos(o));
      await new Promise((r) => setTimeout(r, 500));

      const s = readState();
      const rows = [];
      all.forEach(({ o, depth }, i) => {
        const a = before[i], b = pos(o);
        if (!a || !b || !o.worldVisible) return;
        const moved = Math.hypot(b.x - a.x, b.y - a.y);
        if (moved < 1) return;
        let w = 0, h = 0;
        try { const bb = o.getBounds(); w = bb.width / scale; h = bb.height / scale; } catch (e) { /* ignore */ }
        const t = track.get(o);
        rows.push({
          depth,
          kind: circles.has(o) ? `circle r=${Math.round(o.__wdbR)}` : (o.constructor && o.constructor.name) || '?',
          player: circles.has(o) ? (nameOf(o) || '-') : '-',
          text: typeof (o._text ?? o.text) === 'string' ? (o._text ?? o.text).slice(0, 12) : '',
          kids: o.children ? o.children.length : 0,
          x: Math.round(b.x), y: Math.round(b.y),
          size: `${Math.round(w)}x${Math.round(h)}`,
          moved: Math.round(moved),
          ballShaped: isBallShaped({ w, h }) ? 'yes' : '',
          picked: s && t && s.ball && t.x === s.ball.x && t.y === s.ball.y ? 'BALL' : '',
        });
      });
      console.log(`WDB scan: ${all.length} objects in the current game, ${rows.length} moved in 0.5s:`);
      console.table(rows.slice(0, 40));
      console.log('Bot sees:', s ? { me: s.me, ball: s.ball, players: s.players.map((p) => p.name) } : waitReason);
    },
  };
  WDB.Scan = WDB.scan; // accept either capitalisation
  window.WDB = WDB;
})();