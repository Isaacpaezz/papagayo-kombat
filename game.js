// ¡HOJILLAZO! Guerra de papagayos — Platanus Hack 26 Caracas Edition
// Kite duel over Caracas: sweep your tail's blade (the hojilla) across the rival's string to cut it.

// The whole game lives in one function scope (left unindented) so the minifier can shorten every name.
(() => {

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

// Short names for the Math functions used everywhere.
const { sin, cos, max, min, abs, PI, sign, hypot, floor, round, exp, ceil, atan2, sqrt } = Math;
const TAU = PI * 2;
const { assign } = Object;

const W = 800;
const H = 600;

// Palette shared by the art and the UI; the player colours also identify each side in the HUD.
const INK = 0x1a0f22;
const GOLD = 0xffc04d;
const CREAM = 0xfff3d6;
const DIM = 0xb7a6d8;
const DANGER = 0xff3b4e;
const PLAYER_COLORS = [0xffd23f, 0x3fd2ff];

// ---------------------------------------------------------------------------
// 2. Cabinet input
// ---------------------------------------------------------------------------

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

const normalizeKey = (key) => (typeof key === 'string' ? key.toLowerCase() : '');

const KEYBOARD_TO_ARCADE = Object.fromEntries(
  Object.entries(CABINET_KEYS).flatMap(([code, keys]) => keys.map((key) => [normalizeKey(key), code])),
);

// B1 = JALAR (dash), B2 = RECOGER (hold to reel the line in).
const PLAYER_CODES = [1, 2].map((n) => ({
  up: `P${n}_U`,
  down: `P${n}_D`,
  left: `P${n}_L`,
  right: `P${n}_R`,
  dash: `P${n}_1`,
  reel: `P${n}_2`,
  start: `START${n}`,
}));

const MENU_CODES = {
  up: ['P1_U', 'P2_U'],
  down: ['P1_D', 'P2_D'],
  left: ['P1_L', 'P2_L'],
  right: ['P1_R', 'P2_R'],
  confirm: ['START1', 'START2', 'P1_1', 'P2_1'],
};

/** Tracks held cabinet codes and queues every fresh press until the next drain. */
class CabinetInput {
  constructor(target) {
    this.held = new Set();
    this.queue = [];
    target.addEventListener('keydown', (event) => this.press(event));
    target.addEventListener('keyup', (event) => this.held.delete(KEYBOARD_TO_ARCADE[normalizeKey(event.key)]));
    target.addEventListener('blur', () => this.held.clear());
  }

  press(event) {
    const code = KEYBOARD_TO_ARCADE[normalizeKey(event.key)];
    if (!code || this.held.has(code)) return;
    this.held.add(code);
    this.queue.push(code);
  }

  /** Returns the codes pressed since the last call, oldest first. */
  drain() {
    const presses = this.queue;
    this.queue = [];
    return presses;
  }
}

const Arcade = new CabinetInput(window);

// ---------------------------------------------------------------------------
// 3. Storage & leaderboard
// ---------------------------------------------------------------------------

// Backends in priority order: the arcade storage bridge, localStorage for local development (the
// production iframe has no same-origin, so it throws there), then memory for this session.
const bridgeBackend = {
  async get(key) {
    const { found, value } = await window.platanusArcadeStorage.get(key);
    return found ? value : null;
  },
  set: (key, value) => window.platanusArcadeStorage.set(key, value),
};

const localBackend = {
  get: (key) => JSON.parse(window.localStorage.getItem(key)),
  set: (key, value) => window.localStorage.setItem(key, JSON.stringify(value)),
};

const memory = new Map();
const memoryBackend = {
  get: (key) => memory.get(key) ?? null,
  set: (key, value) => memory.set(key, value),
};

const BACKENDS = [bridgeBackend, localBackend, memoryBackend];

/** Calls `use` on each backend in priority order until one of them does not throw. */
const firstWorking = async (use) => {
  for (const backend of BACKENDS) {
    try {
      return await use(backend);
    } catch {
      // Try the next backend.
    }
  }
};

const storage = {
  get: (key) => firstWorking((backend) => backend.get(key)),
  set: (key, value) => firstWorking((backend) => backend.set(key, value)),
};

// Storage keys keep the game's first name, so records and avatars saved by earlier releases still load.
const LEADERBOARD_KEY = 'papagayos/leaderboard/v1';
const LEADERBOARD_SIZE = 5;
const DEFAULT_LEADERBOARD = [
  { name: 'REY', score: 30000 },
  { name: 'AVI', score: 18000 },
  { name: 'PAP', score: 10000 },
  { name: 'COL', score: 5000 },
  { name: 'VLA', score: 2000 },
];

const isLeaderboardEntry = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.name === 'string' &&
  /^[A-Z]{3}$/.test(entry.name) &&
  Number.isInteger(entry.score) &&
  entry.score >= 0;

const rankEntries = (entries) => [...entries].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);

const Leaderboard = {
  /** Validates whatever was stored (its shape may come from an older release). */
  sanitize(value) {
    const valid = Array.isArray(value) ? value.filter(isLeaderboardEntry) : [];
    const entries = valid.map(({ name, score }) => ({ name, score }));
    return entries.length ? rankEntries(entries) : DEFAULT_LEADERBOARD.map((entry) => ({ ...entry }));
  },

  qualifies: (entries, score) =>
    entries.length < LEADERBOARD_SIZE || score > entries[entries.length - 1].score,

  /** Ties keep the older entry ahead because the sort is stable. */
  insert: (entries, entry) => rankEntries([...entries, entry]),

  load: async () => Leaderboard.sanitize(await storage.get(LEADERBOARD_KEY)),

  save: (entries) => storage.set(LEADERBOARD_KEY, entries),

  /** Validates, inserts and persists an entry; returns the new board and its rank (-1 when rejected). */
  async record(entry) {
    const entries = await Leaderboard.load();
    if (!isLeaderboardEntry(entry)) return { entries, rank: -1 };
    const ranked = Leaderboard.insert(entries, entry);
    await Leaderboard.save(ranked);
    return { entries: ranked, rank: ranked.indexOf(entry) };
  },
};

// ---------------------------------------------------------------------------
// 4. Randomness & geometry
// ---------------------------------------------------------------------------

/** Seeded PRNG (mulberry32) returning floats in [0, 1). */
const makeRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Standard normal sample (Box-Muller). */
const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * cos(TAU * rng());

const between = (rng, [low, high]) => low + rng() * (high - low);

/** `count` values made from their index. */
const range = (count, make) => Array.from({ length: count }, (_, i) => make(i));

const clamp01 = (value) => min(1, max(0, value));

const lerp = (a, b, t) => a + (b - a) * t;

const distance = (a, b) => hypot(a.x - b.x, a.y - b.y);

/** Fills a rectangle on a Phaser Graphics in one colour. */
const rect = (g, color, x, y, w, h, alpha = 1) => g.fillStyle(color, alpha).fillRect(x, y, w, h);

/** Unit vector of a stick or velocity; zero stays zero. */
const unit = (x, y) => {
  const length = hypot(x, y) || 1;
  return [x / length, y / length];
};

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** True when segments ab and cd share a point; collinear overlaps are ignored. */
const segmentsIntersect = (a, b, c, d) => {
  const sideA = cross(c, d, a);
  const sideB = cross(c, d, b);
  if (sideA === 0 && sideB === 0) return false;
  return sideA * sideB <= 0 && cross(a, b, c) * cross(a, b, d) <= 0;
};

/** Point of segment ab nearest to p. */
const nearestOnSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1));
  return { x: a.x + t * dx, y: a.y + t * dy };
};

const pointSegmentDistance = (p, a, b) => distance(p, nearestOnSegment(p, a, b));

// ---------------------------------------------------------------------------
// 5. Kite physics (pure)
// ---------------------------------------------------------------------------

// Fixed 120 Hz step; positions are screen pixels, times are seconds.
const DT = 1 / 120;
// The kids holding the strings stand on two rooftops facing each other across the street.
const ANCHORS = [
  { x: 160, y: 520 },
  { x: 640, y: 520 },
];
const SPAWN_Y = 280;
const STRING = { min: 180, base: 400, reel: 240, payout: 70 };
// The wind pushes a kite with a fixed force (times the wind strength); the stick only redirects it,
// so no amount of steering beats gravity in a calm. Lean tilts that force toward the valley centre.
const KITE = { radius: 25, drag: 2.4, aero: 1020, climb: 0.6, lean: 0.25, slackAero: 0.85, gravity: 680, gust: 150 };
const TAUT_SLACK = 4;
// JALAR (B1): pressing gives a burst along the stick plus a tug that always lifts: an upward kick, then `tug`
// seconds in which the kite flies on full lift as if the wind blew at least `tugWind` (a taut line can't climb
// past its end). Holding B1 keeps that lift on while it drains the AIRE meter.
const DASH = { burst: 200, lift: 400, tug: 0.15, tugWind: 1 };
// AIRE meter (0-1): a press costs `press`, holding drains `drain`/s and flies the kite as if the wind blew at
// least `wind`; released, it refills `refill`/s.
const AIR = { press: 0.35, drain: 1 / 0.9, refill: 1 / 1.5, wind: 0.75 };
const STUN = 0.6;
const IDLE_INPUT = { ax: 0, ay: 0, dash: false, hold: false, reel: false };
// The last segments (from bladeFrom on) carry the hojilla that cuts.
const TAIL = { segments: 12, segment: 12, bladeFrom: 8, gravity: 520, damping: 0.985, windDrag: 0.35 };
// How far below the kite the middle of its blade hangs at rest.
const BLADE_DEPTH = KITE.radius + (TAIL.segment * (TAIL.bladeFrom + TAIL.segments)) / 2;
// A blade only saws while its speed across the rival string exceeds this.
const SWEEP_SPEED = 220;
// Sawing frays a string by the blade's travel across it (px); it snaps at toughness and slowly
// recovers, so a cut takes a few quick strokes in a row ("serruchar").
const FRAY = { toughness: 100, recovery: 15 };

const tailPin = (kite) => ({ x: kite.x, y: kite.y + KITE.radius });

/** Lays the tail straight down from the kite, at rest. */
const hangTail = (kite) => {
  const pin = tailPin(kite);
  kite.tail = range(TAIL.segments + 1, (i) => {
    const y = pin.y + i * TAIL.segment;
    return { x: pin.x, y, px: pin.x, py: y, vx: 0, vy: 0 };
  });
};

const createKite = (player) => {
  const anchor = ANCHORS[player];
  const kite = {
    player,
    anchor,
    x: anchor.x,
    y: SPAWN_Y,
    vx: 0,
    vy: 0,
    len: anchor.y - SPAWN_Y,
    taut: true,
    air: 1,
    tug: 0,
    holding: false,
    stun: 0,
    fray: 0,
    respawn: 0,
    guard: 0,
    vidrio: 0,
    turbo: 0,
    nylon: false,
  };
  hangTail(kite);
  return kite;
};

/** Holding RECOGER reels the line in; otherwise it pays out with the wind up to its usual length. */
const reelLine = (kite, reel, dt) => {
  if (reel) kite.len = max(STRING.min, kite.len - STRING.reel * dt);
  else if (kite.len < STRING.base) kite.len = min(STRING.base, kite.len + STRING.payout * dt);
};

/** Direction of the wind's push: up (leaning to the centre) bent by the stick. */
const aeroDirection = (kite, { ax, ay }) => {
  const [sx, sy] = unit(ax, ay);
  const inward = sign(W / 2 - kite.anchor.x);
  return unit(sin(KITE.lean) * inward * KITE.climb + sx, -cos(KITE.lean) * KITE.climb + sy);
};

/** A taut line turns the wind into a full push, a slack one only part of it; TURBO pushes harder still. */
const accelerate = (kite, input, weather, dt) => {
  const [dx, dy] = aeroDirection(kite, input);
  const boost = kite.tug > 0 ? DASH.tugWind : kite.holding ? AIR.wind : 0;
  const wind = max(weather.wind, boost);
  const push = KITE.aero * wind * (kite.taut || boost > 0 ? 1 : KITE.slackAero) * (kite.turbo ? POWER.push : 1);
  kite.vx += (dx * push + weather.gust) * dt;
  kite.vy += (dy * push + KITE.gravity) * dt;
};

/** JALAR: a burst along the stick (none when centred) plus an upward tug that fights a calm. */
const dash = (kite, { ax, ay }) => {
  const [sx, sy] = unit(ax, ay);
  kite.vx += sx * DASH.burst;
  kite.vy += sy * DASH.burst - DASH.lift;
  kite.tug = DASH.tug;
  kite.air -= AIR.press;
};

/** Whether a JALAR press would fire now. */
const canPull = (kite) => kite.air >= AIR.press;

/** How a player who watches the meter holds B1: lets go when AIRE runs out, holds again once it allows a press. */
const keepHolding = (wants, holding, kite) => wants && kite.air > 0 && (holding || canPull(kite));

/** Holding B1 keeps the tug's lift on while AIRE lasts; released, the meter refills. TURBO keeps it full. */
const holdLift = (kite, hold, dt) => {
  kite.holding = hold && kite.air > 0;
  if (kite.turbo) kite.air = 1;
  else if (kite.holding) kite.air = max(0, kite.air - AIR.drain * dt);
  else if (!hold) kite.air = min(1, kite.air + AIR.refill * dt);
};

const keepOnScreen = (kite) => {
  kite.x = min(W - KITE.radius, max(KITE.radius, kite.x));
  kite.y = max(KITE.radius, kite.y);
};

/** Distance constraint: a taut line projects the kite back onto its circle and cancels outward speed. */
const constrain = (kite) => {
  const dx = kite.x - kite.anchor.x;
  const dy = kite.y - kite.anchor.y;
  const reach = hypot(dx, dy);
  kite.taut = reach >= kite.len - TAUT_SLACK;
  if (reach <= kite.len) return;
  const nx = dx / reach;
  const ny = dy / reach;
  kite.x = kite.anchor.x + nx * kite.len;
  kite.y = kite.anchor.y + ny * kite.len;
  const outward = kite.vx * nx + kite.vy * ny;
  if (outward > 0) {
    kite.vx -= outward * nx;
    kite.vy -= outward * ny;
  }
};

/** Pulls a point back to its leader at exactly one link length (follow-the-leader). */
const follow = (point, leader, link = TAIL.segment) => {
  const gap = distance(point, leader) || 1;
  point.x = leader.x + ((point.x - leader.x) * link) / gap;
  point.y = leader.y + ((point.y - leader.y) * link) / gap;
};

/** Verlet tail hanging from the kite, swayed by the gusts; each point records its velocity for cuts. */
const stepTail = (kite, weather, dt) => {
  const [pin, ...rest] = kite.tail;
  assign(pin, tailPin(kite), { vx: kite.vx, vy: kite.vy });
  for (const point of rest) {
    const vx = (point.x - point.px) * TAIL.damping;
    const vy = (point.y - point.py) * TAIL.damping;
    point.px = point.x;
    point.py = point.y;
    point.x += vx + weather.gust * TAIL.windDrag * dt * dt;
    point.y += vy + TAIL.gravity * dt * dt;
  }
  rest.forEach((point, i) => {
    follow(point, kite.tail[i]);
    point.vx = (point.x - point.px) / dt;
    point.vy = (point.y - point.py) / dt;
  });
};

/** Moves a flying kite one step; returns whether a JALAR press fired. */
const flyKite = (kite, input, weather, dt) => {
  const control = kite.stun > 0 ? IDLE_INPUT : input;
  reelLine(kite, control.reel, dt);
  const pulled = control.dash && canPull(kite);
  if (pulled) dash(kite, control);
  holdLift(kite, control.hold, dt);
  accelerate(kite, control, weather, dt);
  const damping = exp(-KITE.drag * dt);
  kite.vx *= damping;
  kite.vy *= damping;
  kite.x += kite.vx * dt;
  kite.y += kite.vy * dt;
  keepOnScreen(kite);
  constrain(kite);
  return pulled;
};

// Kite countdowns (seconds) that simply run out.
const TIMERS = ['tug', 'stun', 'guard', 'vidrio', 'turbo'];

/** A replacement kite rising from the kid's hands to the spawn height, out of the player's control; at the top
 * it starts its guard (untouchable, blinking). */
const rise = (kite, dt) => {
  kite.respawn = max(0, kite.respawn - dt);
  kite.y = lerp(SPAWN_Y, kite.anchor.y - RESPAWN.low, kite.respawn / RESPAWN.climb);
  kite.len = kite.anchor.y - kite.y;
  if (!kite.respawn) kite.guard = RESPAWN.guard;
  return false;
};

/** Advances one kite by dt and returns whether JALAR fired. */
const stepKite = (kite, input, weather, dt) => {
  TIMERS.forEach((timer) => (kite[timer] = max(0, kite[timer] - dt)));
  const pulled = kite.respawn > 0 ? rise(kite, dt) : flyKite(kite, input, weather, dt);
  stepTail(kite, weather, dt);
  return pulled;
};

/** Neither climbing back up nor blinking: it can be cut, crash and be stunned. */
const vulnerable = (kite) => !kite.respawn && !kite.guard;

/** Unit normal of a kite's string (anchor to kite). */
const stringNormal = (kite) => unit(kite.anchor.y - kite.y, kite.x - kite.anchor.x);

/** Speed of a blade point across a string; the string's own motion does not saw. */
const sweepSpeed = (point, rival) => {
  const [nx, ny] = stringNormal(rival);
  return abs(point.vx * nx + point.vy * ny);
};

/** Fastest speed at which the blade of `kite` saws across the string of `rival`; 0 when it is not sawing. */
const sawSpeed = (kite, rival) => {
  if (kite.respawn || !vulnerable(rival)) return 0;
  const speeds = kite.tail.slice(TAIL.bladeFrom, TAIL.segments).map((point, i) => {
    const crosses = segmentsIntersect(point, kite.tail[TAIL.bladeFrom + i + 1], rival.anchor, rival);
    return crosses ? sweepSpeed(point, rival) : 0;
  });
  const fastest = max(...speeds);
  return fastest > SWEEP_SPEED ? fastest : 0;
};

// ---------------------------------------------------------------------------
// 6. Duel rules (pure)
// ---------------------------------------------------------------------------

// Power lines hang between two poles over the street, sagging toward the middle.
const POWER_LINE = { from: 230, to: 570, y: 462, sag: 16, half: 4 };
const ROOF_Y = 530;
const ZAMURO = { radius: 20, speed: 110, band: [140, 380], every: [5, 9], margin: 40 };
const CLASH = { bounce: 260, grace: 0.35 };
// One 3-2-1, then non-stop flying. TIEMPO lasts `time` s and its last `double` s count twice; VIDAS gives each
// side `lives` kites. `hint` is how long the first calm keeps teaching the hold.
const MATCH = { countdown: 1.8, time: 90, double: 10, lives: 3, hint: 20 };
const RULES = ['tiempo', 'vidas'];
// A lost kite is replaced at once: the new one rises from `low` px above the hands for `climb` s, then stays
// untouchable (blinking) for `guard` s.
const RESPAWN = { climb: 1.5, guard: 1.2, low: 40 };
// Wind strength swings through a slow cycle of gusts and calms; lead is how early the cue warns.
const WIND = { cycle: TAU / 10, flutter: 0.12, flutterRate: 1.7, gustRate: 0.45, lull: 0.55, rafaga: 1.45, lead: 1.5, opening: 0.3 };
// How deep the lulls swing (the duel's `lull`): gentle against the first rival, full against the last.
const LULLS = { ladder: [0.56, 0.6, 0.63, 0.65, 0.67, 0.68], versus: 0.64 };
// Power boxes: one every `every` s (at most `max` around), drifting `drift` × the gust, gone after `life` s.
const POWERS = ['vidrio', 'turbo', 'nylon', 'zamuro'];
const BOX = { every: [10, 14], max: 2, life: 12, radius: 18, x: [260, 540], band: [150, 340], drift: 0.4 };
// VIDRIO and TURBO last that many seconds; TURBO pushes `push` × harder; the allied zamuro chases at `ally` px/s
// for `allyLife` s and stuns for `stun` s.
const POWER = { vidrio: 8, turbo: 5, push: 1.35, ally: 260, allyLife: 4, stun: 1 };

const powerLineY = (x) => {
  const t = (x - POWER_LINE.from) / (POWER_LINE.to - POWER_LINE.from);
  return POWER_LINE.y + POWER_LINE.sag * 4 * t * (1 - t);
};

/** 'line' when the kite touches the wires, 'ground' when it sinks onto the rooftops. */
const crashCause = ({ x, y }) => {
  const overStreet = x >= POWER_LINE.from && x <= POWER_LINE.to;
  if (overStreet && abs(y - powerLineY(x)) < KITE.radius + POWER_LINE.half) return 'line';
  if (y + KITE.radius > ROOF_Y) return 'ground';
  return null;
};

/** Weather at match time `at`: deterministic, so the screen can warn about what comes next. */
const weatherAt = (duel, at = duel.elapsed) => {
  const [cycle, flutter, side] = duel.windPhases;
  return {
    wind: max(0, 1 + duel.lull * sin(at * WIND.cycle + cycle) + WIND.flutter * sin(at * WIND.flutterRate + flutter)),
    gust: KITE.gust * sin(at * WIND.gustRate + side),
  };
};

/** 'calma' or 'rafaga' while one is on or due within the warning lead; null in steady wind. */
const windCue = (duel) => {
  const winds = [duel.elapsed, duel.elapsed + WIND.lead].map((at) => weatherAt(duel, at).wind);
  if (winds.some((wind) => wind < WIND.lull)) return 'calma';
  if (winds.some((wind) => wind > WIND.rafaga)) return 'rafaga';
  return null;
};

const ladderLull = (level) => LULLS.ladder[level];

// The wind cycle starts just below steady and rising, so a match opens with a few seconds of normal wind.
const createDuel = (rng, rules = 'tiempo', lull = LULLS.versus) => ({
  rng,
  rules,
  lull,
  phase: 'countdown',
  clock: MATCH.countdown,
  elapsed: 0,
  grace: 0,
  winner: null,
  score: [0, 0],
  lives: [MATCH.lives, MATCH.lives],
  kites: [createKite(0), createKite(1)],
  zamuros: [],
  boxes: [],
  nextZamuro: between(rng, ZAMURO.every),
  nextBox: between(rng, BOX.every),
  windPhases: [-rng() * WIND.opening, rng() * TAU, rng() * TAU],
});

/** A fresh kite in the kid's hands, about to rise. */
const respawnKite = (player) => {
  const kite = assign(createKite(player), { respawn: RESPAWN.climb });
  rise(kite, 0);
  hangTail(kite);
  return kite;
};

/** Counts a spawn timer down; true when it fires (and restarts it). */
const due = (duel, timer, every, dt) => {
  duel[timer] -= dt;
  if (duel[timer] > 0) return false;
  duel[timer] = between(duel.rng, every);
  return true;
};

const spawn = (duel, dt) => {
  const { rng } = duel;
  if (due(duel, 'nextZamuro', ZAMURO.every, dt)) {
    const direction = rng() < 0.5 ? 1 : -1;
    const x = direction > 0 ? -ZAMURO.margin : W + ZAMURO.margin;
    duel.zamuros.push({ x, y: between(rng, ZAMURO.band), vx: direction * ZAMURO.speed, vy: 0, hit: [false, false] });
  }
  if (due(duel, 'nextBox', BOX.every, dt) && duel.boxes.length < BOX.max) {
    duel.boxes.push({ x: between(rng, BOX.x), y: between(rng, BOX.band), kind: POWERS[floor(rng() * POWERS.length)], life: BOX.life });
  }
};

/** Wild zamuros fly straight across; an allied one (with a `prey`) chases the rival kite until its life ends. */
const flyZamuro = (duel, zamuro, dt) => {
  if (zamuro.prey !== undefined) {
    const prey = duel.kites[zamuro.prey];
    [zamuro.vx, zamuro.vy] = unit(prey.x - zamuro.x, prey.y - zamuro.y).map((v) => v * POWER.ally);
    zamuro.life -= dt;
  }
  zamuro.x += zamuro.vx * dt;
  zamuro.y += zamuro.vy * dt;
};

/** Moves kites, zamuros and boxes; returns a 'dash' event for every JALAR that fired. */
const advanceWorld = (duel, inputs, dt) => {
  const weather = weatherAt(duel);
  const events = [];
  duel.kites.forEach((kite, player) => {
    if (stepKite(kite, inputs[player], weather, dt)) events.push({ type: 'dash', player });
  });
  duel.zamuros.forEach((zamuro) => flyZamuro(duel, zamuro, dt));
  duel.zamuros = duel.zamuros.filter(({ x, life = 1 }) => life > 0 && x > -ZAMURO.margin - 1 && x < W + ZAMURO.margin + 1);
  duel.boxes.forEach((box) => {
    box.x += weather.gust * BOX.drift * dt;
    box.life -= dt;
  });
  duel.boxes = duel.boxes.filter((box) => box.life > 0);
  return events;
};

/** A zamuro stuns each kite it may touch once (an ally only its prey, harder); returns the stun events. */
const stunKites = (duel) => {
  const events = [];
  for (const zamuro of duel.zamuros) {
    duel.kites.forEach((kite, player) => {
      const ally = zamuro.prey !== undefined;
      if (zamuro.hit[player] || (ally && zamuro.prey !== player) || !vulnerable(kite)) return;
      if (distance(zamuro, kite) > ZAMURO.radius + KITE.radius) return;
      zamuro.hit[player] = true;
      kite.stun = ally ? POWER.stun : STUN;
      if (ally) zamuro.life = 0;
      events.push({ type: 'stun', player });
    });
  }
  duel.zamuros = duel.zamuros.filter(({ life = 1 }) => life > 0);
  return events;
};

/** What a box does to the kite (or, for the zamuro, the side) that caught it. */
const empower = (duel, player, kind) => {
  const kite = duel.kites[player];
  if (kind === 'nylon') kite.nylon = true;
  else if (kind === 'zamuro') duel.zamuros.push({ x: kite.anchor.x, y: ROOF_Y, vx: 0, vy: 0, hit: [false, false], prey: 1 - player, life: POWER.allyLife });
  else kite[kind] = POWER[kind];
};

/** A flying kite that touches a box takes its power; returns the pickup events. */
const collect = (duel) => {
  const events = [];
  duel.boxes = duel.boxes.filter((box) => {
    const player = duel.kites.findIndex((kite) => !kite.respawn && distance(kite, box) < BOX.radius + KITE.radius);
    if (player < 0) return true;
    empower(duel, player, box.kind);
    events.push({ type: 'power', player, kind: box.kind });
    return false;
  });
  return events;
};

/** Wears each string by the rival blade's travel across it (VIDRIO snaps it at once), or lets it recover;
 * returns which snapped. */
const frayStrings = (duel, dt) => {
  const { kites } = duel;
  return kites.map((kite, i) => {
    const cutter = kites[1 - i];
    const speed = duel.grace > 0 ? 0 : sawSpeed(cutter, kite);
    kite.fray = speed ? (cutter.vidrio ? FRAY.toughness : kite.fray + speed * dt) : max(0, kite.fray - FRAY.recovery * dt);
    return kite.fray >= FRAY.toughness;
  });
};

/** Both strings snapping in the same step cancel out: the kites bounce apart and both strings half-heal. */
const clash = (duel) => {
  const [a, b] = duel.kites;
  a.fray /= 2;
  b.fray /= 2;
  const [nx, ny] = unit(a.x - b.x, a.y - b.y);
  a.vx += nx * CLASH.bounce;
  a.vy += ny * CLASH.bounce;
  b.vx -= nx * CLASH.bounce;
  b.vy -= ny * CLASH.bounce;
  duel.grace = CLASH.grace;
  return { type: 'clash' };
};

/** Scores a lost kite (twice in TIEMPO's last seconds) and replaces it; the event carries the lost kite. */
const award = (duel, loser, cause) => {
  const winner = 1 - loser;
  const value = duel.rules === 'tiempo' && duel.elapsed > MATCH.time - MATCH.double ? 2 : 1;
  const kite = duel.kites[loser];
  duel.score[winner] += value;
  duel.lives[loser] -= 1;
  duel.kites[loser] = respawnKite(loser);
  return { type: 'point', cause, loser, winner, value, kite };
};

/** Checks shields, cuts and crashes after a step; a double crash is a draw that only replaces both kites. */
const resolve = (duel, dt) => {
  const { kites } = duel;
  const snapped = frayStrings(duel, dt);
  if (snapped[0] && snapped[1]) return [clash(duel)];
  const events = [];
  kites.forEach((kite, player) => {
    if (!snapped[player] || !kite.nylon) return;
    assign(kite, { nylon: false, fray: 0 });
    snapped[player] = false;
    events.push({ type: 'shield', player });
  });
  const causes = kites.map((kite, i) => (snapped[i] ? 'cut' : vulnerable(kite) && crashCause(kite)));
  const losers = [0, 1].filter((player) => causes[player]);
  if (losers.length === 1) events.push(award(duel, losers[0], causes[losers[0]]));
  if (losers.length === 2) {
    duel.kites = [0, 1].map(respawnKite);
    events.push({ type: 'point', cause: 'draw', loser: null, winner: null, value: 0 });
  }
  return events;
};

/** The match winner, or null while it goes on (VIDAS: whoever still has kites; TIEMPO: the leader at the end,
 * or the first to score in sudden death). */
const matchWinner = ({ rules, score, lives, elapsed }) => {
  if (rules === 'vidas') {
    const out = lives.findIndex((left) => left <= 0);
    return out < 0 ? null : 1 - out;
  }
  if (elapsed < MATCH.time || score[0] === score[1]) return null;
  return score[0] > score[1] ? 0 : 1;
};

const flyStep = (duel, inputs, dt) => {
  const before = duel.elapsed;
  duel.elapsed += dt;
  duel.grace = max(0, duel.grace - dt);
  spawn(duel, dt);
  const events = [...advanceWorld(duel, inputs, dt), ...stunKites(duel), ...collect(duel), ...resolve(duel, dt)];
  const reached = (mark) => duel.rules === 'tiempo' && before < mark && duel.elapsed >= mark;
  if (reached(MATCH.time - MATCH.double)) events.push({ type: 'double' });
  if (reached(MATCH.time) && duel.score[0] === duel.score[1]) events.push({ type: 'sudden' });
  const winner = matchWinner(duel);
  if (winner === null) return events;
  assign(duel, { phase: 'over', winner });
  return [...events, { type: 'over', winner }];
};

const PHASES = {
  countdown(duel, inputs, dt) {
    duel.clock -= dt;
    if (duel.clock > 0) return [];
    duel.phase = 'fly';
    return [{ type: 'go' }];
  },
  fly: flyStep,
  over: () => [],
};

/** Advances the duel by dt with one input per player and returns what happened. */
const stepDuel = (duel, inputs, dt) => PHASES[duel.phase](duel, inputs, dt);

// ---------------------------------------------------------------------------
// 7. CPU rival (pure)
// ---------------------------------------------------------------------------

// Rival stats, in this order: reaction (seconds between decisions); aim (target noise, px); dashRange (px from
// the target to JALAR); guard (chance to retreat when a blade threatens its string); nerve (how low, y, it sinks
// before climbing); foresight (chance to heed the CALMA warning instead of waiting for the calm itself);
// aggression (chance to go sawing on each decision instead of holding high above its anchor); stroke (how far
// past the rival string each saw stroke reaches); pace (share of frames it pushes the stick outside a climb);
// greed (chance to go after a power box when one is around).
const RIVAL_STATS = ['reaction', 'aim', 'dashRange', 'guard', 'nerve', 'foresight', 'aggression', 'stroke', 'pace', 'greed'];
const rival = (name, home, motto, stats) => ({ name, home, motto, ...Object.fromEntries(RIVAL_STATS.map((key, i) => [key, stats[i]])) });
// The regional ladder, from a careful beginner from Catia to the old master of El Valle.
const RIVALS = [
  rival('EL CHAMO', 'CATIA, CARACAS', '¡QUÉ LO QUÉ, PANA!', [0.75, 100, 0, 0, 410, 0.7, 0.6, 0, 0.45, 0.1]),
  rival('LA GOCHA', 'MÉRIDA', '¡AY, QUÉ FRÍO, MIJO!', [0.6, 80, 40, 0.15, 405, 0.5, 0.7, 25, 0.6, 0.2]),
  rival('EL GUARO', 'BARQUISIMETO', '¡GUARO, TE VOY A CORTAR!', [0.47, 56, 70, 0.3, 420, 0.27, 0.8, 50, 0.68, 0.3]),
  rival('LA MARGARITEÑA', 'MARGARITA', '¡AY, VALE, QUÉ BRISA!', [0.3, 30, 80, 0.4, 410, 0.25, 0.9, 60, 0.76, 0.4]),
  rival('EL MARACUCHO', 'MARACAIBO', '¡QUÉ MOLLEJA DE PAPAGAYO!', [0.18, 22, 90, 0.45, 400, 0.2, 1, 75, 0.74, 0.5]),
  rival('DON GOYO', 'EL VALLE, CARACAS', 'CUARENTA AÑOS CORTANDO PAPAGAYOS', [0.12, 18, 110, 0.75, 420, 0, 1, 70, 0.74, 0.6]),
];
// strikeAlong: where on the rival string to aim, as a fraction from its kite toward its anchor.
const CPU = { strikeAlong: 0.25, floor: 390, threat: 90, deadzone: 10 };

const createCpu = (level, player, rng) => ({
  spec: RIVALS[level],
  player,
  rng,
  think: 0,
  target: null,
  reel: false,
  dash: false,
  climbing: false,
  lifting: false,
  holding: false,
});

/** Kite position that hangs the blade across the rival string, a little below the rival kite. */
const strikePoint = (rival) => ({
  x: rival.x + (rival.anchor.x - rival.x) * CPU.strikeAlong,
  y: rival.y + (rival.anchor.y - rival.y) * CPU.strikeAlong - BLADE_DEPTH,
});

/** Aims past the strike point on the far side of the string, so the blade saws across it. */
const sawPoint = (me, rival, stroke) => {
  const strike = strikePoint(rival);
  const [nx, ny] = stringNormal(rival);
  const side = (me.x - strike.x) * nx + (me.y - strike.y) * ny < 0 ? 1 : -1;
  return { x: strike.x + side * nx * stroke, y: strike.y + side * ny * stroke };
};

const threatened = (me, rival) => pointSegmentDistance(rival.tail[TAIL.segments], me.anchor, me) < CPU.threat;

/** Where a kite flies safest: straight above its own anchor, on the end of its line. */
const retreatPoint = (kite) => ({ x: kite.anchor.x, y: kite.anchor.y - kite.len });

const sinking = (cpu, duel, me) => {
  const heeds = cpu.rng() < cpu.spec.foresight;
  const calm = heeds ? windCue(duel) === 'calma' : weatherAt(duel).wind < WIND.lull;
  return calm || me.y > cpu.spec.nerve;
};

/** Re-plans after its reaction time: climb out of a calm, retreat when threatened, chase a box, or saw. */
const plan = (cpu, duel) => {
  const { spec, rng } = cpu;
  const me = duel.kites[cpu.player];
  const rival = duel.kites[1 - cpu.player];
  cpu.think = spec.reaction * (0.75 + rng() * 0.5);
  cpu.climbing = sinking(cpu, duel, me);
  // B1 is held only once the calm is really on (or the kite is low): held during the warning it would empty
  // AIRE before the calm arrives.
  cpu.lifting = cpu.climbing && (weatherAt(duel).wind < WIND.lull || me.y > cpu.spec.nerve);
  if (cpu.climbing) {
    assign(cpu, { target: { x: me.x, y: 0 }, reel: false, dash: true });
    return;
  }
  cpu.reel = threatened(me, rival) && rng() < spec.guard;
  const attacks = !cpu.reel && rng() < spec.aggression;
  const [box] = duel.boxes;
  const greedy = !cpu.reel && box && rng() < spec.greed;
  const aim = greedy ? box : attacks ? sawPoint(me, rival, spec.stroke) : retreatPoint(me);
  cpu.target = {
    x: aim.x + gaussian(rng) * spec.aim,
    y: min(CPU.floor, aim.y + gaussian(rng) * spec.aim),
  };
  cpu.dash = distance(me, cpu.target) < spec.dashRange;
};

const axis = (delta) => (abs(delta) < CPU.deadzone ? 0 : sign(delta));

/** Digital joystick and buttons for the CPU player: a planned JALAR fires once AIRE allows it, and B1 is held
 * while climbing out of a calm. */
const cpuInput = (cpu, duel, dt) => {
  const me = duel.kites[cpu.player];
  cpu.think -= dt;
  if (cpu.think <= 0) plan(cpu, duel);
  const dashNow = cpu.dash && canPull(me);
  if (dashNow) cpu.dash = false;
  // Slow rivals dawdle while attacking but never while climbing; only they draw from the rng here,
  // so faster ones keep their exact decision sequence.
  const coasting = !cpu.climbing && cpu.spec.pace < 1 && cpu.rng() > cpu.spec.pace;
  return {
    ax: coasting ? 0 : axis(cpu.target.x - me.x),
    ay: coasting ? 0 : axis(cpu.target.y - me.y),
    dash: dashNow,
    hold: (cpu.holding = keepHolding(cpu.lifting, cpu.holding, me)),
    reel: cpu.reel,
  };
};

// ---------------------------------------------------------------------------
// 8. Score, stats & ladder (pure)
// ---------------------------------------------------------------------------

// Solo points: a cut is worth more than a rival's crash (both doubled when the point is); beating rival n pays
// `win` × n, plus `flawless` if the rival never scored.
const SCORE = { cut: 1000, crash: 400, win: 2000, flawless: 1500 };

const createStats = () => [0, 1].map(() => ({ cuts: 0, crashes: 0, dashes: 0 }));

/** Adds one duel event to the per-player CORTES / CHOQUES / JALONES counters. */
const tally = (stats, { type, cause, winner, loser, player }) => {
  if (type === 'dash') stats[player].dashes += 1;
  if (type !== 'point' || winner === null) return;
  if (cause === 'cut') stats[winner].cuts += 1;
  else stats[loser].crashes += 1;
};

/** Points the human (player 0) earns for a point. */
const pointScore = ({ cause, winner, value }) => (winner === 0 ? (cause === 'cut' ? SCORE.cut : SCORE.crash) * value : 0);

const matchBonus = (winner, score, level) =>
  winner === 0 ? SCORE.win * (level + 1) + (score[1] === 0 ? SCORE.flawless : 0) : 0;

const ladderOutcome = (winner, level) => {
  if (winner !== 0) return 'defeat';
  return level === RIVALS.length - 1 ? 'champion' : 'next';
};

const AvatarStore = {
  load: async () => sanitizeChoices(await storage.get(AVATAR_KEY)),
  save: (choices) => storage.set(AVATAR_KEY, choices),
};

const LETTER_COUNT = 26;

/** Cycles an initial through A-Z, wrapping at both ends. */
const shiftLetter = (letter, step) =>
  String.fromCharCode(65 + ((((letter.charCodeAt(0) - 65 + step) % LETTER_COUNT) + LETTER_COUNT) % LETTER_COUNT));

// ---------------------------------------------------------------------------
// 9. Avatars (pure)
// ---------------------------------------------------------------------------

const SKINS = [0xf3cfa6, 0xd9a173, 0xa8693f, 0x6b4126];
const SHIRTS = [0xffd23f, 0x3fd2ff, 0xe8432e, 0x2fbf71, 0xe83e9b, 0xf2f2f2];
const HAIR_TONES = { dark: 0x2b1a12, blond: 0xf2c14e, white: 0xeeeae2 };
// Bodies: 0 chamo, 1 chama, 2 señor (rival only). Hair styles are indices into HAIR_PAINTERS; the first two
// belong to chamos, the next two to chamas, and the rest are the rivals' own.
const BODY_NAMES = ['CHAMO', 'CHAMA'];
const HAIR_NAMES = ['CORTO', 'GORRA', 'COLA', 'MOÑO'];
const HAIRS_BY_BODY = [
  [0, 1],
  [2, 3],
];
// Kite designs: which of the six paper panels take the accent colour, and that accent. The other panels
// keep the player's own colour, so the kite still matches the HUD.
const KITE_DESIGNS = [
  ['010101', 0xe8432e],
  ['010101', 0xe83e9b],
  ['001001', 0x2fbf71],
  ['000111', 0x2b3a8f],
  ['011011', 0xf2f2f2],
];
// Customisation rows, top to bottom, and how many values each one has (hair depends on the body).
const LOOK_ROWS = ['body', 'hair', 'skin', 'shirt', 'kite'];
const ROW_SIZES = { body: BODY_NAMES.length, skin: SKINS.length, shirt: SHIRTS.length, kite: KITE_DESIGNS.length };
const DEFAULT_CHOICES = [
  { body: 0, hair: 0, skin: 1, shirt: 0, kite: 0 },
  { body: 1, hair: 2, skin: 2, shirt: 1, kite: 1 },
];
const AVATAR_KEY = 'papagayos/avatar/v1';

const inRange = (value, size) => Number.isInteger(value) && value >= 0 && value < size;

/** A stored choice is usable only if every row holds a valid value (its shape may come from another release). */
const isChoice = (choice) =>
  choice !== null &&
  typeof choice === 'object' &&
  Object.entries(ROW_SIZES).every(([row, size]) => inRange(choice[row], size)) &&
  HAIRS_BY_BODY[choice.body].includes(choice.hair);

/** Both players' choices from whatever was stored; anything invalid falls back to that player's default. */
const sanitizeChoices = (value) =>
  DEFAULT_CHOICES.map((fallback, player) => {
    const choice = Array.isArray(value) ? value[player] : null;
    return Object.fromEntries(LOOK_ROWS.map((row) => [row, (isChoice(choice) ? choice : fallback)[row]]));
  });

/** Steps one row of a choice, wrapping; changing the body keeps the hair's position in the new body's list. */
const cycleChoice = (choice, row, step) => {
  const wrap = (value, size) => (value + step + size) % size;
  if (row === 'hair') {
    const hairs = HAIRS_BY_BODY[choice.body];
    return { ...choice, hair: hairs[wrap(hairs.indexOf(choice.hair), hairs.length)] };
  }
  const next = { ...choice, [row]: wrap(choice[row], ROW_SIZES[row]) };
  if (row === 'body') next.hair = HAIRS_BY_BODY[next.body][HAIRS_BY_BODY[choice.body].indexOf(choice.hair)];
  return next;
};

const kiteOf = (color, [panels, accent]) => ({ colors: [color, accent], panels });

/** A look as drawn: body and hair indices, skin, shirt and hair colours, size, and kite. */
const look = (body, hair, skin, shirt, hairTone, scale, kite) => ({ body, hair, skin, shirt, hairTone, scale, kite });

/** What a player's choice looks like on screen. */
const resolveLook = (choice, player) =>
  look(choice.body, choice.hair, SKINS[choice.skin], SHIRTS[choice.shirt], HAIR_TONES.dark, 1, kiteOf(PLAYER_COLORS[player], KITE_DESIGNS[choice.kite]));

// The six regional rivals, by ladder level (hair indices beyond the players' are the rivals' own).
const RIVAL_LOOKS = [
  look(0, 1, SKINS[2], 0x2fbf71, HAIR_TONES.dark, 0.96, kiteOf(0x2fbf71, ['001001', 0xffffff])),
  look(1, 4, SKINS[0], 0x8a3a8a, HAIR_TONES.dark, 0.98, kiteOf(0xe8432e, ['011011', 0x2b3a8f])),
  look(0, 5, SKINS[1], 0xd8323c, HAIR_TONES.dark, 1.04, kiteOf(0xd8323c, ['000111', 0xffd23f])),
  look(1, 6, SKINS[2], 0x2ec4b6, HAIR_TONES.dark, 1, kiteOf(0x2ec4b6, ['010101', 0xffffff])),
  look(0, 7, SKINS[1], 0x2f6fd6, HAIR_TONES.dark, 1.12, kiteOf(0x2f6fd6, ['001001', 0xffd23f])),
  look(2, 8, SKINS[2], 0xf2ead8, HAIR_TONES.white, 1.16, kiteOf(0xff8a1f, ['010101', 0x1c1c1c])),
];

/**
 * Who stands on each azotea, with the name the screen gives them: in solo the human (TÚ) against the rival of
 * that ladder level, in versus both players as customised. Every scene pairs names and looks through this.
 */
const lineup = (mode, level, choices) =>
  mode === 'solo'
    ? [{ name: 'TÚ', look: resolveLook(choices[0], 0) }, { name: RIVALS[level].name, look: RIVAL_LOOKS[level] }]
    : [0, 1].map((player) => ({ name: `JUGADOR ${player + 1}`, look: resolveLook(choices[player], player) }));

const looksOf = (cast) => cast.map(({ look }) => look);
const namesOf = (cast) => cast.map(({ name }) => name);

// ---------------------------------------------------------------------------
// 10. Art direction (pure)
// ---------------------------------------------------------------------------

const RIM = 0xffa25e;
const STICK = 0x4a2c18;
const STEEL = 0xe8eef7;
const WIRE = 0x150c13;
const ZAMURO_INK = 0x17111a;
const ZAMURO_TIP = 0xcfc6bd;
const WINDOW_LIT = 0xffd27a;
// Faded street paper, never as saturated as the tail bows.
const PAPELITOS = [0xc79a8c, 0x93a7b3, 0xd3c29a, 0xae96ab];

// Sky stops from the top down to the horizon: a fixed Caracas sunset.
const SKY = [0x2b1640, 0x7a2f5b, 0xe2683c, 0xffb347];
// Visible breeze (px/s): papelitos race in a gust, drift and sink in a calm.
const BREEZE = { speed: 120, gust: 0.6, sink: 60 };
const SAG = { taut: 3, slack: 0.6, max: 90 };

/** Linear blend of two 0xRRGGBB colours. */
const mixColor = (from, to, t) => {
  const channel = (shift) => {
    const a = (from >> shift) & 0xff;
    return round(a + (((to >> shift) & 0xff) - a) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
};

/** How the wind looks (px/s) on the papelitos. */
const windDrift = ({ wind, gust }) => ({ vx: wind * (BREEZE.speed + gust * BREEZE.gust), vy: BREEZE.sink * (1 - wind) });

/** Belly of a string at its middle (px): nearly straight when taut, loose when slack. */
const stringSag = (kite) =>
  kite.taut ? SAG.taut : min(SAG.max, SAG.taut + (kite.len - distance(kite, kite.anchor)) * SAG.slack);

/** Points of a curve from a to b whose middle hangs `sag` px down. */
const sagCurve = (a, b, sag, count = 12) =>
  range(count + 1, (i) => {
    const t = i / count;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) + 4 * sag * t * (1 - t) };
  });

/** Midpoint displacement: `count + 1` offsets (count a power of two) whose bumps shrink with scale. */
const ridgeLine = (rng, count, rough) => {
  const offsets = new Array(count + 1).fill(0);
  for (let step = count; step > 1; step /= 2) {
    for (let i = step / 2; i < count; i += step) {
      offsets[i] = (offsets[i - step / 2] + offsets[i + step / 2]) / 2 + (rng() - 0.5) * rough * step;
    }
  }
  return offsets;
};

/** Rotates and scales local [x, y] points around (x, y). */
const posed = (points, x, y, angle, scale = 1) => {
  const c = cos(angle) * scale;
  const n = sin(angle) * scale;
  return points.map(([px, py]) => ({ x: x + px * c - py * n, y: y + px * n + py * c }));
};

// A cut kite tumbles away: heavy, spinning, nudged by the gust (presentation only).
const FALL = { gravity: 900, drift: 0.8, drag: 0.6, spin: 9 };

/** A copy of a cut kite (with its tail) that can fall without touching the duel. */
const createFall = ({ x, y, vx, vy, tail }) => ({ x, y, vx, vy, spin: 0, tail: tail.map((point) => ({ ...point })) });

const stepFall = (fall, weather, dt) => {
  const damping = exp(-FALL.drag * dt);
  fall.vx = (fall.vx + weather.gust * FALL.drift * dt) * damping;
  fall.vy = (fall.vy + FALL.gravity * dt) * damping;
  fall.x += fall.vx * dt;
  fall.y += fall.vy * dt;
  fall.spin += FALL.spin * dt * sign(fall.vx || 1);
  stepTail(fall, weather, dt);
};


// ---------------------------------------------------------------------------
// 11. Pixel art: font and backdrop painters (baked once at screen resolution)
// ---------------------------------------------------------------------------

// The canvas is a quarter of the 800×600 world: every screen pixel is PIXEL world units wide, so everything the
// game draws comes out in chunky pixels. Backdrop textures are painted pixel by pixel at that resolution.
const PIXEL = 2;
const PW = W / PIXEL;
const PH = H / PIXEL;
// Background layers are wider than the screen so they can slide for parallax.
const PARALLAX = 40;
const WIDE = (W + 2 * PARALLAX) / PIXEL;

// 5×7 glyphs, one base-32 digit per row (bit 4 is the left column); accented capitals reuse their base letter
// with a mark in the two rows above. Baked with a one-pixel ink outline, so tinting keeps it readable anywhere.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?¡¿.,:·-/×()+‹› ';
const GLYPH_ROWS =
  'ehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhhe44444e72222ichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhlllahha4ahhhha4444v1248gvehjlphe4c4444eeh1248vv2421he26aiv22vgu11he68guhhev124888ehhehheehhf12c4444404eh1240440444444048ghe00000cc0000c480cc0cc0000cc00000e00011248gg0ha4ah024888428422248044v440024842008424800000000';
const ACCENTS = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };
// The mark above an accented letter, as [x, y] pixels in the two rows over the glyph.
const MARKS = { acute: [[3, 0], [2, 1]], tilde: [[1, 0], [2, 0], [4, 0], [0, 1], [2, 1], [3, 1]] };
const FONT = { key: 'pixel-font', cell: 7, height: 11, advance: 6, perRow: 16 };
const FONT_CHARS = GLYPHS + Object.keys(ACCENTS).join('');

/** Pixels of a character in its cell: the 5×7 glyph (top-left at 1, 3) plus the accent mark, if any. */
const glyphPixels = (char) => {
  const base = ACCENTS[char] || char;
  const index = GLYPHS.indexOf(base);
  const pixels = [];
  for (let row = 0; row < 7; row += 1) {
    const bits = parseInt(GLYPH_ROWS[index * 7 + row], 32);
    for (let col = 0; col < 5; col += 1) if (bits & (16 >> col)) pixels.push([1 + col, 3 + row]);
  }
  if (base !== char) (char === 'Ñ' ? MARKS.tilde : MARKS.acute).forEach(([x, y]) => pixels.push([1 + x, 1 + y]));
  return pixels;
};

const rgba = (color, alpha = 1) => `rgba(${color >> 16},${(color >> 8) & 255},${color & 255},${alpha})`;

/** Fills whole pixels: painters only draw axis-aligned rectangles, so nothing is ever antialiased. */
const fill = (ctx, color, x, y, w = 1, h = 1, alpha = 1) => {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillRect(round(x), round(y), round(w), round(h));
};

/** Every character in white with an ink outline, in rows of FONT.perRow cells. */
const paintFont = (ctx) =>
  [INK, 0xffffff].forEach((color, pass) =>
    [...FONT_CHARS].forEach((char, i) => {
      const x = (i % FONT.perRow) * FONT.cell;
      const y = floor(i / FONT.perRow) * FONT.height;
      glyphPixels(char).forEach(([px, py]) => fill(ctx, color, x + px - 1 + pass, y + py - 1 + pass, pass ? 1 : 3, pass ? 1 : 3));
    }),
  );

const seedOf = (text) => [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);

/** Paints a canvas texture once per game, with an rng seeded by its key; later scenes reuse it. */
const bake = (scene, key, width, height, paint) => {
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, width, height);
    paint(texture.context, makeRng(seedOf(key)));
    texture.refresh();
  }
  return key;
};

/** Registers the pixel font once; every text in the game uses it. */
const loadFont = (scene) => {
  if (scene.cache.bitmapFont.exists(FONT.key)) return;
  const columns = FONT.perRow * FONT.cell;
  const image = bake(scene, FONT.key, columns, ceil(FONT_CHARS.length / FONT.perRow) * FONT.height, paintFont);
  const font = Phaser.GameObjects.RetroFont.Parse(scene, {
    image,
    width: FONT.cell,
    height: FONT.height,
    chars: FONT_CHARS,
    charsPerRow: FONT.perRow,
    spacing: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
  });
  // Outlines of neighbouring letters overlap by a pixel, as on old arcade boards.
  Object.values(font.data.chars).forEach((char) => (char.xAdvance = FONT.advance));
  scene.cache.bitmapFont.add(FONT.key, font);
};

/** One row of a disc (or of its top half, a dome) per scanline. */
const disc = (ctx, color, cx, cy, r, alpha = 1, dome = false) => {
  for (let dy = -r; dy <= (dome ? 0 : r); dy += 1) {
    const half = floor(sqrt(r * r - dy * dy));
    fill(ctx, color, cx - half, cy + dy, half * 2 + 1, 1, alpha);
  }
};

/** Colour `t` of the way through evenly spaced stops. */
const gradientAt = (stops, t) => {
  const at = t * (stops.length - 1);
  const i = min(floor(at), stops.length - 2);
  return mixColor(stops[i], stops[i + 1], at - i);
};

const HORIZON = 236;
const SKY_BANDS = 12;
const SUN = { x: 150, y: 250, size: 48 };
const SUN_RINGS = [
  [22, 0xff7a40, 0.18],
  [17, 0xffa050, 0.32],
  [12, 0xffe6a0, 1],
  [9, 0xfffbe8, 1],
];

/** Flat sky bands from the top down to the horizon, each meeting the next in a checkerboard dither row. */
const paintSky = (ctx) => {
  const band = HORIZON / SKY_BANDS;
  for (let i = 0; i < SKY_BANDS; i += 1) {
    const color = gradientAt(SKY, i / (SKY_BANDS - 1));
    fill(ctx, color, 0, floor(i * band), PW, i === SKY_BANDS - 1 ? PH : ceil(band));
    for (let x = 0; x < PW; x += 2) fill(ctx, color, x, floor(i * band) - 1);
  }
};

const paintSun = (ctx) => SUN_RINGS.forEach(([r, color, alpha]) => disc(ctx, color, SUN.size / 2, SUN.size / 2, r, alpha));

// El Ávila, far crest then the main crest with the Hotel Humboldt and the teleférico (pixels).
const RIDGES = [
  { color: 0x8c6a98, shade: 0x7a5b8a, rim: 0xe0a0a8, base: 200, peak: 104, centre: 280, spread: 180, rough: 0.5, depth: 0.02 },
  { color: 0x58397a, shade: 0x462e64, rim: 0xff9a84, base: 228, peak: 118, centre: 190, spread: 150, rough: 0.7, depth: 0.04, landmarks: true },
];
const HUMBOLDT = { body: 0xe8e2f0, band: 0x9a8fb4 };
const CABLE_CAR = { from: 0.08, cabins: [0.3, 0.55, 0.8], color: 0xd8323c };

/** The Hotel Humboldt: a white round tower with banded floors and a crown, on the summit. */
const paintHumboldt = (ctx, x, y) => {
  fill(ctx, HUMBOLDT.body, x - 3, y - 15, 7, 16);
  for (let floorY = y - 13; floorY < y; floorY += 3) fill(ctx, HUMBOLDT.band, x - 3, floorY, 7, 1);
  fill(ctx, HUMBOLDT.body, x - 4, y - 17, 9, 2);
  fill(ctx, INK, x, y - 23, 1, 6);
};

/** The teleférico from the valley up to the summit: a sagging cable, pylons and red cabins. */
const paintCableCar = (ctx, [x0, y0], [x1, y1]) => {
  const at = (t) => [lerp(x0, x1, t), lerp(y0, y1, t) + 10 * t * (1 - t)];
  for (let t = 0; t < 1; t += 0.004) fill(ctx, INK, ...at(t));
  [0.2, 0.65].forEach((t) => fill(ctx, INK, at(t)[0], at(t)[1], 1, 7));
  CABLE_CAR.cabins.forEach((t) => {
    const [x, y] = at(t);
    fill(ctx, INK, x, y, 1, 2);
    fill(ctx, CABLE_CAR.color, x - 2, y + 2, 5, 4);
    fill(ctx, CREAM, x - 1, y + 3, 3, 1);
  });
};

/** One crest of El Ávila: column fills under a flat-topped, roughened crest, with quebradas running down. */
const paintRidge = ({ color, shade, rim, base, peak, centre, spread, rough, landmarks }) => (ctx, rng) => {
  const offsets = ridgeLine(rng, 64, rough);
  const crest = range(WIDE, (x) => floor(base - (base - peak) / (1 + ((x - centre) / spread) ** 4) + offsets[floor((x / WIDE) * 64)]));
  crest.forEach((y, x) => {
    fill(ctx, color, x, y, 1, PH - y);
    fill(ctx, rim, x, y);
  });
  for (let i = 0; i < 26; i += 1) {
    const x = floor(rng() * WIDE);
    const slope = rng() - 0.5;
    for (let t = 2; t < 10 + rng() * 40; t += 1) fill(ctx, shade, x + slope * t, crest[x] + t, 1, 2);
  }
  if (!landmarks) return;
  const summit = crest.indexOf(min(...crest));
  paintHumboldt(ctx, summit, crest[summit]);
  const foot = floor(WIDE * CABLE_CAR.from);
  paintCableCar(ctx, [foot, crest[foot] + 6], [summit - 6, crest[summit] - 4]);
};

// Ranchos are painted fronts with a darker roof line; some windows already glow at sunset.
const RANCHOS = [0xc0603e, 0xd27d4e, 0xe8a85a, 0xd96a8a, 0x5aa0c8, 0x8bc06a, 0xe6d26a, 0xb07ac8];
const RANCHO_ROOF = 0x5a3a4a;
const CERROS = { reach: 175, rise: 78, foot: 246, ranchos: 230 };
const LANDMARKS = { twins: [178, 192], twinTop: 150, tower: 246, towerTop: 140, color: 0x4a4066, brick: 0x9a4a3a, glass: 0x2a2440 };
const CITY_DEPTH = 0.09;

/** A window: dark glass, or already lit by a fixed pattern. */
const pane = (ctx, x, y, w = 1, h = 1) => fill(ctx, (x * 7 + y * 13) % 9 ? LANDMARKS.glass : WINDOW_LIT, x, y, w, h);

/** Parque Central's twin towers: ribbed concrete shafts with stepped crowns. */
const paintTwins = (ctx) =>
  LANDMARKS.twins.forEach((x) => {
    const top = LANDMARKS.twinTop;
    fill(ctx, LANDMARKS.color, x, top, 10, PH);
    fill(ctx, LANDMARKS.color, x + 2, top - 3, 6, 3);
    fill(ctx, INK, x + 4, top - 9, 1, 6);
    for (let y = top + 3; y < CERROS.foot; y += 3) for (let px = x + 1; px < x + 9; px += 2) pane(ctx, px, y);
  });

/** The Torre de David: a tall unfinished tower with brick patches and its helipad roof. */
const paintTorreDeDavid = (ctx, rng) => {
  const x = LANDMARKS.tower;
  const top = LANDMARKS.towerTop;
  fill(ctx, LANDMARKS.color, x, top, 14, PH);
  fill(ctx, INK, x - 3, top - 2, 20, 2);
  for (let y = top + 3; y < CERROS.foot; y += 3) {
    for (let px = x + 1; px < x + 13; px += 2) {
      if (rng() < 0.3) fill(ctx, LANDMARKS.brick, px, y, 2, 2);
      else pane(ctx, px, y);
    }
  }
};

/** A cerro on one edge of the valley, covered top to bottom in colourful ranchos. */
const paintCerro = (ctx, rng, side) => {
  const edge = side ? WIDE : 0;
  const inward = side ? -1 : 1;
  const hill = (x) => CERROS.foot - CERROS.rise * max(0, 1 - abs(x - edge) / CERROS.reach) ** 1.3;
  for (let i = 0; i <= CERROS.reach; i += 1) fill(ctx, 0x3a2240, edge + inward * i, hill(edge + inward * i) - 3, 1, PH);
  range(CERROS.ranchos, () => {
    const x = floor(edge + inward * rng() * CERROS.reach);
    return { x, y: floor(between(rng, [hill(x), CERROS.foot + 6])), w: 5 + floor(rng() * 5), h: 4 + floor(rng() * 3) };
  })
    .sort((a, b) => a.y - b.y)
    .forEach(({ x, y, w, h }) => {
      fill(ctx, RANCHOS[floor(rng() * RANCHOS.length)], x, y - h, w, h);
      fill(ctx, RANCHO_ROOF, x - 1, y - h - 1, w + 2, 1);
      pane(ctx, x + 1 + floor(rng() * (w - 2)), y - h + 2);
    });
};

/** The mid-distance city: the two landmark towers and the cerros of ranchos framing them. */
const paintCity = (ctx, rng) => {
  paintTwins(ctx);
  paintTorreDeDavid(ctx, rng);
  [0, 1].forEach((side) => paintCerro(ctx, rng, side));
};

const POLE = { top: 223, bar: 27 };
const CABLES = [-7, 0, 7];

/** Wooden poles with crossbars and three sagging cables, stepped pixel by pixel. */
const paintWires = (ctx) => {
  const [from, to] = [POWER_LINE.from, POWER_LINE.to].map((x) => x / PIXEL);
  [from, to].forEach((x) => {
    fill(ctx, WIRE, x - 2, POLE.top, 4, PH);
    fill(ctx, WIRE, x - POLE.bar / 2, POLE.top + 3, POLE.bar, 2);
  });
  CABLES.forEach((offset) => {
    for (let x = from; x <= to; x += 1) fill(ctx, WIRE, x, (powerLineY(x * PIXEL) + offset) / PIXEL);
  });
};

// Azoteas seen slightly from above: the kid stands on the front edge of a deck whose back edge is ROOF_Y.
const DECK = 572;
const AZOTEA = { half: 40 };
// Per-player rooftop clutter, x offsets (pixels) from the anchor: water tank, then an antenna or a dish.
const ROOFTOPS = [
  { tank: -24, antenna: -33, wall: 0x6a3a4a },
  { tank: 31, dish: 15, wall: 0x7a4a3a },
];
const TANK = { body: 0x2c5aa0, light: 0x5b8fd8, dark: 0x1d3d6e };

/** A wall with rows of windows, as for every building in front of the cerros. */
const paintBlock = (ctx, x, y, w, color) => {
  fill(ctx, color, x, y, w, PH - y);
  fill(ctx, mixColor(color, CREAM, 0.3), x, y, w, 1);
  for (let wy = y + 4; wy < PH - 3; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) pane(ctx, wx, wy, 3, 3);
};

/** The blue water tank on legs that sits on every Caracas rooftop. */
const paintTank = (ctx, x, roof) => {
  fill(ctx, INK, x - 6, roof - 6, 1, 6);
  fill(ctx, INK, x + 5, roof - 6, 1, 6);
  fill(ctx, TANK.body, x - 7, roof - 19, 14, 13);
  fill(ctx, TANK.light, x - 4, roof - 19, 2, 13);
  fill(ctx, TANK.dark, x - 8, roof - 21, 16, 2);
};

/** The two flyers' azoteas with their clutter, the blocks under the cables and frame blocks at the edges. */
const paintAzoteas = (ctx, rng) => {
  const roof = ROOF_Y / PIXEL;
  const deck = DECK / PIXEL;
  for (let x = POWER_LINE.from / PIXEL; x < POWER_LINE.to / PIXEL - 15; x += 25 + floor(rng() * 5)) {
    paintBlock(ctx, x, 274 + rng() * 13, 23, 0x4a2a44);
  }
  paintBlock(ctx, -5, 226, 36, 0x3e2440);
  paintBlock(ctx, PW - 32, 231, 37, 0x3e2440);
  ANCHORS.forEach(({ x: anchor }, player) => {
    const x = anchor / PIXEL;
    const { tank, antenna, dish, wall } = ROOFTOPS[player];
    paintBlock(ctx, x - AZOTEA.half, deck, AZOTEA.half * 2, wall);
    fill(ctx, mixColor(wall, CREAM, 0.15), x - AZOTEA.half - 2, roof - 2, AZOTEA.half * 2 + 4, deck - roof + 2);
    fill(ctx, CREAM, x - AZOTEA.half - 2, roof - 3, AZOTEA.half * 2 + 4, 1);
    fill(ctx, INK, x - AZOTEA.half - 2, deck - 1, AZOTEA.half * 2 + 4, 1);
    paintTank(ctx, x + tank, roof);
    if (antenna) {
      fill(ctx, INK, x + antenna, roof - 29, 1, 29);
      [0, 4, 8].forEach((dy, i) => fill(ctx, INK, x + antenna - 6 + i, roof - 28 + dy, 12 - i * 2, 1));
    }
    if (dish) {
      fill(ctx, INK, x + dish, roof - 13, 1, 13);
      disc(ctx, 0xcfc6bd, x + dish, roof - 16, 5, 1, true);
    }
  });
};

/** A tiny white square: sparks, glints and wind dust. */
const paintPixel = (ctx) => fill(ctx, 0xffffff, 0, 0, 1, 1);

const BLOOM = { size: 33, rings: [16, 11, 6], alpha: 0.3 };

/** Stepped light rings for a burst of light (blended additively and tinted). */
const paintBloom = (ctx) => BLOOM.rings.forEach((r) => disc(ctx, 0xffffff, BLOOM.size >> 1, BLOOM.size >> 1, r, BLOOM.alpha));

// ---------------------------------------------------------------------------
// 12. Backdrop (parallax layers)
// ---------------------------------------------------------------------------

/** Every camera shows the 800×600 world on the 400×300 canvas. */
const pixelCamera = (camera) => camera.setZoom(1 / PIXEL).centerOn(W / 2, H / 2);

/** Sky, sun, El Ávila, the city and wires at sunset; the far layers slide a little with the action. */
class Backdrop {
  constructor(scene) {
    pixelCamera(scene.cameras.main);
    loadFont(scene);
    const image = (key, paint, width = PW) => scene.add.image(0, 0, bake(scene, key, width, PH, paint)).setOrigin(0).setScale(PIXEL);
    image('sky', paintSky);
    scene.add.image(SUN.x, SUN.y, bake(scene, 'sun', SUN.size, SUN.size, paintSun)).setScale(PIXEL).setBlendMode('ADD');
    this.parallax = [...RIDGES.map((ridge, i) => [image(`ridge-${i}`, paintRidge(ridge), WIDE), ridge.depth]), [image('city', paintCity, WIDE), CITY_DEPTH]];
    image('wires', paintWires);
    this.addForeground = () => image('azoteas', paintAzoteas);
  }

  update(focusX) {
    this.parallax.forEach(([image, depth]) => image.setX(-PARALLAX + (W / 2 - focusX) * depth));
  }
}

// ---------------------------------------------------------------------------
// 13. Actors: wind, zamuros, kids, kites
// ---------------------------------------------------------------------------

// Particles turn into streaks exactly when the wind reaches the ¡RÁFAGA! threshold.
const WIND_PARTICLES = { count: 70, top: 20, bottom: 520, streak: BREEZE.speed * WIND.rafaga, trace: 0.06 };

/** Papelitos and dust that make the wind visible: they streak in gusts and flutter down in calms. */
class WindParticles {
  constructor() {
    const rng = makeRng(7);
    this.items = range(WIND_PARTICLES.count, () => ({
      x: rng() * W,
      y: between(rng, [WIND_PARTICLES.top, WIND_PARTICLES.bottom]),
      pace: 0.6 + rng() * 0.8,
      spin: rng() * TAU,
      dust: rng() < 0.4,
      color: PAPELITOS[floor(rng() * PAPELITOS.length)],
    }));
  }

  update(drift, dt) {
    const { top, bottom } = WIND_PARTICLES;
    for (const item of this.items) {
      item.spin += dt * (2 + abs(drift.vx) * 0.02);
      item.x = ((item.x + drift.vx * item.pace * dt + W + 80) % (W + 80)) - 40;
      item.y += (drift.vy * item.pace + sin(item.spin) * 14) * dt;
      if (item.y > bottom) item.y = top;
      if (item.y < top) item.y = bottom;
    }
  }

  draw(g, drift) {
    const streaks = hypot(drift.vx, drift.vy) > WIND_PARTICLES.streak;
    this.items.forEach(({ x, y, pace, spin, dust, color }) => {
      if (streaks) {
        const trace = WIND_PARTICLES.trace * pace;
        g.lineStyle(2, CREAM, 0.6).lineBetween(x, y, x - drift.vx * trace, y - drift.vy * trace);
      } else if (dust) {
        rect(g, RIM, x, y, PIXEL, PIXEL, 0.6);
      } else {
        // A papelito flips between its face and its edge as it tumbles.
        const flat = sin(spin) > 0;
        rect(g, color, x, y, flat ? 6 : 2, flat ? 4 : 6);
      }
    });
  }
}

/** Black vulture in flight: wings flap around the body, with pale primaries at the tips. */
const drawVulture = (g, x, y, flap, scale) => {
  const span = 22 * scale;
  const tipY = y + flap * 10 * scale;
  g.fillStyle(ZAMURO_INK);
  [-1, 1].forEach((side) => {
    g.fillTriangle(x, y - 3 * scale, x + side * span, tipY, x + side * 5 * scale, y + 4 * scale);
    rect(g, ZAMURO_TIP, x + side * span - (side > 0 ? 6 : 0) * scale, tipY - 2, 6 * scale, 4);
    g.fillStyle(ZAMURO_INK);
  });
  g.fillEllipse(x, y + scale, 16 * scale, 8 * scale);
  rect(g, 0x6b5f60, x - 3, y - 6 * scale, 6, 6);
};

/** The kids on both azoteas. */
const drawRooftops = (g, flyers) => flyers.forEach((flyer, player) => drawAvatar(g, flyer.look, flyer.stance(ANCHORS[player])));

// The kid stands on the front edge of the deck, larger than life; the string hand rests on the physics anchor and
// the other hand (`grip` px behind it) holds the line.
const KID = { foot: DECK - 2, back: 18, scale: 1.45, jump: 16, slump: 6, grip: 10 };
// Figure proportions in local units: feet at y 0 and up is negative; looks and poses scale and flip it.
const FIGURE = { hip: -28, shoulder: -58, head: -73, headR: 10, hunch: 5 };
const FACE = { ink: 0x2a1810, white: 0xffffff, blush: 0xff7a8a, tear: 0x8fd3ff };
const PANTS = 0x2c3550;
const HEADGEAR = { cap: 0xd8323c, wool: 0xf2f2f2, ruana: 0x8a3a8a, stripe: 0xffd23f, flower: 0xff5d8f, hat: 0x8a6a3a, band: 0x3b2414 };
// One-pixel ink outline around every figure: the figure drawn in ink, nudged one pixel each way.
const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// How long a kid celebrates (or sulks) after a point.
const CHEER_S = 1.2;
const SPIN_RATE = 18;
const YANK_DECAY = 4;

/** Per-player art state: the kid's look and animation, and the tumble of a kite it just lost. */
class Flyer {
  constructor(player, look) {
    assign(this, { player, look, side: player === 0 ? 1 : -1, clock: 0, yank: 0, holding: false, lift: 0, cheerTime: 0, fall: null });
  }

  dash() {
    this.yank = 1;
  }

  /** Celebrates (or sulks) for a while; an endless cheer closes the match. */
  cheer(mood, seconds = CHEER_S) {
    assign(this, { cheering: mood, cheerTime: seconds });
  }

  /** The kid's own animation: jumping while it celebrates, slumping while it sulks. */
  pose(dt) {
    this.clock += dt;
    this.cheerTime -= dt;
    this.mood = this.cheerTime > 0 ? this.cheering : null;
    this.lift = this.mood === 'win' ? abs(sin(this.clock * 9)) * KID.jump : 0;
  }

  /** Follows its kite: the arm yanks on JALAR and stays up while B1 is held. */
  update(kite, dt) {
    this.pose(dt);
    this.holding = kite.holding;
    this.yank = kite.holding ? 1 : max(0, this.yank - dt * YANK_DECAY);
  }

  /** The string hand: on the anchor at rest, yanked back and up on JALAR. */
  hand({ anchor }) {
    return { x: anchor.x - this.side * this.yank * 12, y: anchor.y - this.yank * 7 - this.lift };
  }

  /** Where and how the kid stands on its azotea. */
  stance(anchor) {
    const { side, mood, lift, yank, clock } = this;
    const expression = mood || (this.holding || yank > 0.5 ? 'effort' : 'focus');
    return { x: anchor.x - side * KID.back, y: KID.foot, scale: KID.scale, side, mood, expression, lift, yank, clock, hand: this.hand({ anchor }) };
  }
}

/** Cap of hair over the top of the head, shared by most styles. */
const hairCap = (g, { x, y }, tone) => g.fillStyle(tone).fillEllipse(x, y - 5, 22, 12);

// One painter per hair style (indices as in HAIRS_BY_BODY, then the rivals'), drawn over the head:
// (g, head, side, hair tone, dye, clock). `dye` turns a fixed colour into ink for the outline pass.
const HAIR_PAINTERS = [
  (g, h, s, tone) => hairCap(g, h, tone).fillRect(h.x - s * 10 - 1.5, h.y - 6, 3, 7),
  (g, h, s, tone, dye) => g.fillStyle(dye(HEADGEAR.cap)).fillEllipse(h.x, h.y - 5, 23, 13).fillRect(min(h.x - s * 8, h.x - s * 18), h.y - 7, 10, 3),
  (g, h, s, tone, dye, clock) => hairCap(g, h, tone).fillEllipse(h.x - s * 13, h.y + 1 + sin(clock * 4) * 2, 8, 17).fillStyle(dye(HEADGEAR.cap)).fillCircle(h.x - s * 10, h.y - 5, 2.5),
  (g, h, s, tone) => hairCap(g, h, tone).fillCircle(h.x - s * 2, h.y - 13, 6),
  // LA GOCHA: a striped ruana over the shoulders and a wool hat with a pompom.
  (g, h, s, tone, dye) => {
    const poncho = [[-10, 12], [10, 12], [18, 42], [-18, 42]].map(([x, y]) => ({ x: h.x + x, y: h.y + y }));
    g.fillStyle(dye(HEADGEAR.ruana)).fillPoints(poncho, true).fillStyle(dye(HEADGEAR.stripe)).fillRect(h.x - 16, h.y + 32, 32, 3);
    hairCap(g, h, tone).fillStyle(dye(HEADGEAR.wool)).fillEllipse(h.x, h.y - 7, 23, 14).fillStyle(dye(HEADGEAR.cap)).fillCircle(h.x, h.y - 15, 4);
  },
  // EL GUARO: a mop of curls.
  (g, h, s, tone) => [-8, -4, 0, 4, 8, -5, 2].forEach((ox, i) => g.fillStyle(tone).fillCircle(h.x + ox, h.y - (i < 5 ? 6 : 11), 5)),
  // LA MARGARITEÑA: long hair down her back with a flower.
  (g, h, s, tone, dye) => hairCap(g, h, tone).fillRect(min(h.x - s * 3, h.x - s * 13), h.y - 6, 10, 24).fillStyle(dye(HEADGEAR.flower)).fillCircle(h.x - s * 7, h.y - 8, 3.5),
  // EL MARACUCHO: spiky hair.
  (g, h, s, tone) => {
    [-7, -2, 3, 8].forEach((ox) => g.fillStyle(tone).fillTriangle(h.x + ox - 4, h.y - 6, h.x + ox + 4, h.y - 6, h.x + ox - s * 2, h.y - 15));
    hairCap(g, h, tone);
  },
  // DON GOYO: white hair under a sombrero.
  (g, h, s, tone, dye) => {
    g.fillStyle(tone).fillEllipse(h.x - s * 8, h.y + 1, 6, 9);
    g.fillStyle(dye(HEADGEAR.hat)).fillRoundedRect(h.x - 8, h.y - 19, 16, 11, 4).fillEllipse(h.x, h.y - 8, 34, 7);
    rect(g, dye(HEADGEAR.band), h.x - 8, h.y - 11, 16, 2);
  },
];

/** Face toward the kite, in blocky pixels: eyes, brows and mouth for the mood (focus, effort, win, lose). */
const drawFace = (g, { x, y }, side, expression, old) => {
  const ex = x + side * 2;
  const eyes = [ex - 4, ex + 3];
  const brow = { focus: 1, effort: 2, win: -1, lose: -2 }[expression];
  g.fillStyle(FACE.ink);
  eyes.forEach((eye, i) => g.fillRect(eye - 1, y - 6 + (i ? brow : -brow), 3, 1.5));
  if (expression === 'win') eyes.forEach((eye) => g.fillRect(eye - 1, y - 2, 3, 1.5));
  else if (expression === 'effort') eyes.forEach((eye) => g.fillRect(eye - 1, y - 1, 3, 1.5));
  else eyes.forEach((eye) => g.fillRect(eye, y - 3, 2, 3));
  if (expression === 'win') {
    g.fillRect(ex - 4, y + 2, 8, 4).fillStyle(FACE.white).fillRect(ex - 3, y + 2, 6, 1.5);
    rect(g, FACE.blush, ex - 8, y, 3, 2).fillRect(ex + 6, y, 3, 2);
  } else if (expression === 'effort') {
    g.fillRect(ex - 3, y + 3, 6, 3).fillStyle(FACE.white).fillRect(ex - 3, y + 3, 6, 1.5);
    rect(g, FACE.tear, x - side * 10, y - 7, 2, 4);
  } else if (expression === 'lose') {
    g.fillRect(ex - 3, y + 4, 6, 1.5).fillRect(ex - 4, y + 5.5, 2, 1.5).fillRect(ex + 2, y + 5.5, 2, 1.5);
    rect(g, FACE.tear, eyes[1], y, 2, 4);
  } else g.fillRect(ex - 2, y + 4, 4, 1.5);
  if (old) rect(g, HAIR_TONES.white, ex - 5, y + 2, 10, 3);
};

/** One pass of a figure in local units, in the given palette (ink for the outline passes). */
const paintFigure = (g, look, pose, palette, hand, face) => {
  const { side: s, mood, lift, yank } = pose;
  const { skin, cloth, pants, tone, dye } = palette;
  const chama = look.body === 1;
  const old = look.body === 2;
  const slump = mood === 'lose' ? KID.slump : 0;
  const hunch = old ? FIGURE.hunch : 0;
  const lean = -s * yank * 5 + s * hunch;
  const hip = FIGURE.hip - lift;
  const shoulder = FIGURE.shoulder - lift + slump + hunch * 0.6;
  const head = { x: lean + s * (slump * 0.6 + hunch * 1.2), y: FIGURE.head - lift + slump * 2 + hunch };
  const width = chama ? 14 : old ? 20 : 18;
  g.lineStyle(old ? 7 : chama ? 4.5 : 6, old ? pants : skin);
  g.lineBetween(-5, 0, -3, hip).lineBetween(5, 0, 3, hip);
  if (chama) g.fillStyle(pants).fillPoints([{ x: -6, y: hip - 3 }, { x: 6, y: hip - 3 }, { x: 10, y: hip + 10 }, { x: -10, y: hip + 10 }], true);
  else rect(g, pants, -8, hip - 2, 16, old ? 6 : 10);
  rect(g, cloth, lean / 2 - width / 2, shoulder, width, hip - shoulder + 2);
  if (old) g.fillEllipse(lean / 2 + s * 4, hip - 10, 18, 16);
  g.fillStyle(skin).fillCircle(head.x, head.y, FIGURE.headR);
  HAIR_PAINTERS[look.hair](g, head, s, tone, dye, pose.clock);
  if (face) drawFace(g, head, s, pose.expression, old);
  const from = { x: lean + s * 5, y: shoulder + 3 };
  const arm = (to) => {
    const bend = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 7 };
    g.lineStyle(chama ? 4 : 5, cloth).lineBetween(from.x, from.y, bend.x, bend.y);
    g.lineStyle(chama ? 4 : 5, skin).lineBetween(bend.x, bend.y, to.x, to.y);
  };
  arm(hand);
  if (mood === 'win') arm({ x: -s * 8, y: FIGURE.head - lift - 24 + sin(pose.clock * 12) * 4 });
  else if (mood === 'lose') arm({ x: -s * 8, y: hip + 10 });
  else arm({ x: hand.x - s * KID.grip, y: hand.y + 9 });
};

/**
 * A kid (or rival) in any pose and size: an ink outline, then the figure with its face.
 * `pose.hand` is in world space, so the string hand can sit exactly on the physics anchor at any scale.
 */
const drawAvatar = (g, look, pose) => {
  const scale = pose.scale * look.scale;
  const hand = { x: (pose.hand.x - pose.x) / scale, y: (pose.hand.y - pose.y) / scale };
  const pants = look.body === 1 ? mixColor(look.shirt, INK, 0.45) : PANTS;
  const nudge = PIXEL / scale;
  g.save().translateCanvas(pose.x, pose.y).scaleCanvas(scale, scale);
  OUTLINE.forEach(([dx, dy]) => {
    g.save().translateCanvas(dx * nudge, dy * nudge);
    paintFigure(g, look, pose, { skin: INK, cloth: INK, pants: INK, tone: INK, dye: () => INK }, hand, false);
    g.restore();
  });
  paintFigure(g, look, pose, { skin: look.skin, cloth: look.shirt, pants, tone: look.hairTone, dye: (color) => color }, hand, true);
  g.restore();
};

const KITE_POINTS = [[0, -44], [25, -12], [19, 17], [0, 26], [-19, 17], [-25, -12]];
const KITE_HUB = [0, -6];
const BRIDLE = 16;
const FLUTTER = { rate: 9, swing: 0.05, lean: 0.0015 };

/** Traditional papagayo in flat pixel colours: paper panels, varillas and a thick ink outline. */
const drawPapagayo = (g, x, y, angle, scale, { colors, panels }, filled = true) => {
  const corners = posed(KITE_POINTS, x, y, angle, scale);
  if (!filled) {
    g.fillStyle(INK, 0.55).fillPoints(corners, true);
    g.lineStyle(2, CREAM, 0.7).strokePoints(corners, true);
    return;
  }
  const [hub] = posed([KITE_HUB], x, y, angle, scale);
  corners.forEach((corner, i) => {
    const next = corners[(i + 1) % corners.length];
    g.fillStyle(colors[panels[i]]).fillTriangle(hub.x, hub.y, corner.x, corner.y, next.x, next.y);
  });
  g.lineStyle(max(2, 4 * scale), INK).strokePoints(corners, true);
  g.lineStyle(2, STICK)
    .lineBetween(corners[0].x, corners[0].y, corners[3].x, corners[3].y)
    .lineBetween(corners[5].x, corners[5].y, corners[1].x, corners[1].y);
};

const kiteAngle = (kite, flyer) =>
  atan2(kite.y - kite.anchor.y, kite.x - kite.anchor.x) +
  PI / 2 +
  kite.vx * FLUTTER.lean +
  sin(flyer.clock * FLUTTER.rate + flyer.player * 2) * FLUTTER.swing +
  kite.stun * SPIN_RATE;

/** Where the frenillo meets the string, a little in front of the kite toward the kid. */
const bridleKnot = (kite) => {
  const [ux, uy] = unit(kite.anchor.x - kite.x, kite.anchor.y - kite.y);
  return { x: kite.x + ux * BRIDLE, y: kite.y + uy * BRIDLE };
};

/** String from the kid's hand to the bridle, one pixel wide with an ink edge; frayed, it pulses red and sheds
 * loose fibres where the rival blade is sawing. */
const drawString = (g, flyer, kite, rival) => {
  const curve = sagCurve(flyer.hand(kite), bridleKnot(kite), stringSag(kite));
  const wear = clamp01(kite.fray / FRAY.toughness);
  if (wear > 0) {
    g.lineStyle(4 + floor(wear * 4) * 2, DANGER, wear * (0.4 + 0.3 * sin(flyer.clock * 14))).strokePoints(curve);
    const blade = rival.tail[TAIL.bladeFrom + 2];
    const at = curve.reduce((best, point) => (distance(point, blade) < distance(best, blade) ? point : best));
    rect(g, DANGER, at.x - 4, at.y - 4, 8, 8);
    for (let k = 0; k < floor(wear * 8); k += 1) {
      const angle = k * 2.1 + flyer.clock * 3;
      rect(g, 0xffc0b0, at.x + cos(angle) * (6 + (k % 3) * 3), at.y + sin(angle) * (6 + (k % 3) * 3), 2, 2);
    }
  }
  g.lineStyle(4, INK, 0.5).strokePoints(curve);
  g.lineStyle(2, mixColor(CREAM, DANGER, wear)).strokePoints(curve);
};

/** A ribbon bow (lazo) across the tail at p. */
const drawBow = (g, p, previous, color) => {
  const [dx, dy] = unit(p.x - previous.x, p.y - previous.y);
  [-1, 1].forEach((side) => {
    const ox = -dy * 7 * side;
    const oy = dx * 7 * side;
    g.fillStyle(color).fillTriangle(p.x, p.y, p.x + ox + dx * 3, p.y + oy + dy * 3, p.x + ox - dx * 3, p.y + oy - dy * 3);
  });
};

/** Tail cord with alternating bows, then the steel hojilla with teeth and a glinting tip. */
const drawTail = (g, kite, [a, b], shimmer = 1) => {
  const { tail } = kite;
  g.lineStyle(2, INK).strokePoints(tail.slice(0, TAIL.bladeFrom + 1));
  for (let i = 1; i < TAIL.bladeFrom; i += 1) drawBow(g, tail[i], tail[i - 1], i % 2 ? a : b);
  const blade = tail.slice(TAIL.bladeFrom);
  // VIDRIO: ground glass glued on the blade glows.
  if (kite.vidrio) g.lineStyle(14, GLASS, 0.4 + 0.3 * shimmer).strokePoints(blade);
  g.lineStyle(6, INK).strokePoints(blade);
  g.lineStyle(2, STEEL).strokePoints(blade);
  g.fillStyle(0xffffff);
  blade.slice(1).forEach((p, i) => {
    const [dx, dy] = unit(p.x - blade[i].x, p.y - blade[i].y);
    const side = i % 2 ? 5 : -5;
    g.fillTriangle(p.x, p.y, p.x - dx * 6, p.y - dy * 6, p.x - dy * side - dx * 2, p.y + dx * side - dy * 2);
  });
  const tip = tail[TAIL.segments];
  rect(g, 0xffffff, tip.x - 4, tip.y - 1, 8, 2, shimmer).fillRect(tip.x - 1, tip.y - 4, 2, 8);
};

// Power colours and icons: glass shards, a turbo bolt, a nylon ring and a little vulture.
const GLASS = 0x8ff3ff;
const TURBO_BOLT = 0xffd23f;
const CRATE = { size: 32, wood: 0xb06a32, edge: 0x6a3a1a };
const BOLT_ICON = [[2, -12], [-6, 2], [0, 2], [-2, 12], [6, -2], [0, -2]];

/** The NYLON shield: a pulsing bubble around the kite. */
const drawShield = (g, kite, clock) => kite.nylon && g.lineStyle(2, GLASS, 0.6 + 0.3 * sin(clock * 8)).strokeCircle(kite.x, kite.y, 42);

/** A floating power box: a wooden crate with its power's icon, bobbing on the wind. */
const drawBox = (g, { x, y, kind }, clock) => {
  const by = y + round(sin(clock * 3 + x) * 3) * PIXEL;
  const half = CRATE.size / 2;
  rect(g, INK, x - half - 2, by - half - 2, CRATE.size + 4, CRATE.size + 4).fillStyle(CRATE.wood).fillRect(x - half, by - half, CRATE.size, CRATE.size);
  g.lineStyle(2, CRATE.edge).strokeRect(x - half + 3, by - half + 3, CRATE.size - 6, CRATE.size - 6);
  if (kind === 'vidrio') g.fillStyle(GLASS).fillTriangle(x, by - 11, x + 7, by + 3, x - 5, by + 10).fillStyle(0xffffff).fillRect(x - 1, by - 5, 3, 3);
  else if (kind === 'turbo') g.fillStyle(TURBO_BOLT).fillPoints(posed(BOLT_ICON, x, by, 0), true);
  else if (kind === 'nylon') g.lineStyle(4, GLASS).strokeCircle(x, by, 8);
  else drawVulture(g, x, by, sin(clock * 12), 0.5);
};

// ---------------------------------------------------------------------------
// 14. Effects & audio
// ---------------------------------------------------------------------------

// Square pixel sparks (the 1×1 texture scaled up), falling under gravity.
const SPARKS = {
  speed: { min: 80, max: 360 },
  lifespan: { min: 250, max: 700 },
  scale: { start: 6, end: 2 },
  gravityY: 520,
  emitting: false,
};
// Warm light and sparks for a cut, cold ones for the cables; each spark cools through its colours as it dies.
const BURSTS = [0xffb060, 0x7fc4ff];
const SPARK_COLORS = [
  [0xffffff, 0xffe08a, 0xff9a40],
  [0xffffff, 0xbfe9ff, 0x5ab0ff],
];
const BURST = { from: 1.2, to: 10, alpha: 0.9, ms: 380, sparks: 45 };

/** Pixel spark bursts and local blooms of light. */
class Fx {
  constructor(scene) {
    const spark = bake(scene, 'pixel', 1, 1, paintPixel);
    this.emitters = SPARK_COLORS.map((color) => scene.add.particles(0, 0, spark, { ...SPARKS, color }));
    const bloom = bake(scene, 'bloom', BLOOM.size, BLOOM.size, paintBloom);
    this.glows = BURSTS.map((color) => scene.add.image(0, 0, bloom).setTint(color).setBlendMode('ADD').setVisible(false));
    this.animations = scene.tweens;
  }

  /** Pixel sparks of one kind (0 warm, 1 electric). */
  sparks(count, x, y, kind = 0) {
    this.emitters[kind].explode(count, x, y);
  }

  /** Sparks and a local bloom of light (warm for a cut, cold for the cables) instead of a full-screen flash. */
  burst(kind, x, y) {
    const glow = this.glows[kind];
    this.sparks(BURST.sparks, x, y, kind);
    this.animations.killTweensOf(glow);
    glow.setPosition(x, y).setVisible(true).setScale(BURST.from).setAlpha(BURST.alpha);
    this.animations.add({ targets: glow, scale: BURST.to, alpha: 0, duration: BURST.ms, ease: 'Quad.easeOut' });
  }
}

const createAudioContext = () => {
  try {
    return new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return null;
  }
};

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// A bright D major flourish for every point won, and a rising one for a power.
const JINGLE = [62, 66, 69, 74];
const POWER_UP = [69, 76, 81];
// Each sound is a list of voices: [wave or 'noise', frequency, filter type, filter sweep from, to, gain, seconds, delay].
const notes = (midis, gain) => midis.map((midi, i) => ['triangle', midiToHz(midi), 'lowpass', 3500, 900, gain, 0.4, i * 0.08]);
const SOUNDS = {
  whoosh: [['noise', 0, 'bandpass', 400, 2400, 0.35, 0.3]],
  snap: [['noise', 0, 'highpass', 5000, 5000, 0.9, 0.07], ['sine', 90, 'lowpass', 400, 200, 0.5, 0.3]],
  crackle: [['sawtooth', 55, 'lowpass', 4000, 300, 0.4, 0.5]],
  thud: [['sine', 70, 'lowpass', 300, 300, 0.5, 0.35]],
  // Dull click for a JALAR pressed without enough AIRE.
  refuse: [['square', 160, 'lowpass', 900, 900, 0.12, 0.07]],
  go: [['triangle', 880, 'lowpass', 4000, 4000, 0.2, 0.15]],
  jingle: notes(JINGLE, 0.3),
  power: notes(POWER_UP, 0.25),
};

/** Light synthesised SFX; silent without an AudioContext and never needed to play. */
const createSfx = (ctx) => {
  const master = ctx && ctx.createGain();
  const noise = ctx && ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  if (ctx) {
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    window.addEventListener('keydown', () => ctx.state === 'suspended' && ctx.resume());
  }

  /** One voice through a sweeping filter and a decaying gain to the master bus. */
  const voice = ([wave, frequency, type, from, to, gain, duration, delay = 0]) => {
    const start = ctx.currentTime + delay;
    const source = wave === 'noise' ? assign(ctx.createBufferSource(), { buffer: noise }) : assign(ctx.createOscillator(), { type: wave });
    if (frequency) source.frequency.value = frequency;
    const filter = assign(ctx.createBiquadFilter(), { type });
    const amp = ctx.createGain();
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
    source.stop(start + duration);
  };

  return { play: (name) => ctx && SOUNDS[name].forEach(voice) };
};

const sfx = createSfx(createAudioContext());

// ---------------------------------------------------------------------------
// 15. Duel view & HUD
// ---------------------------------------------------------------------------

const HUD = { margin: 24, nameY: 24, scoreY: 56, pipGap: 30, meterY: 84, meterW: 120, meterH: 10, powerY: 104, clockY: 30 };
const CUES = {
  viene: { text: '¡SE VIENE LA CALMA!', color: DIM },
  calma: { text: '¡CALMA! · JALA PARA SUBIR', color: CREAM },
  // The match's first calm teaches the hold instead.
  primera: { text: 'MANTÉN B1 PARA JALAR', color: GOLD },
  rafaga: { text: '¡RÁFAGA!', color: GOLD },
};
// Banner, detail line and rank of each point cause, power and match moment.
const SHOUTS = {
  cut: ['¡CORTADO!', '', 3],
  line: ['¡CHISPAZO!', '', 3],
  ground: ['¡SE CAYÓ!', '', 3],
  draw: ['¡EMPATE!', '', 3],
  vidrio: ['¡VIDRIO!', 'UN SERRUCHAZO CORTA', 2],
  turbo: ['¡TURBO!', 'VUELA RÁPIDO, AIRE SIN FIN', 2],
  nylon: ['¡NYLON!', 'AGUANTA UN CORTE', 2],
  zamuro: ['¡ZAMURO ALIADO!', 'VA POR EL RIVAL', 2],
  shield: ['¡NYLON!', 'EL HILO AGUANTÓ', 2],
  double: ['¡DOBLE!', 'LOS PUNTOS VALEN DOBLE', 4],
  sudden: ['¡MUERTE SÚBITA!', 'EL PRÓXIMO PUNTO GANA', 4],
  go: ['¡A VOLAR!', '', 1],
};
// Every centre announcement shares ONE banner slot for `seconds`. A higher rank cuts in at once (the shout it
// interrupts waits again); the rest wait in line, by rank then age, and only the `keep` highest stay queued.
// Wind cues and hints only show while the slot is empty.
const BANNER = { seconds: 1.2, keep: 2 };

const createBanner = () => ({ shout: null, left: 0, queue: [] });

/** Puts a shout `{ rank, … }` on screen when it outranks the current one, otherwise in line. */
const announce = (banner, shout) => {
  const [first, ...rest] = [banner.shout, ...banner.queue, shout].filter(Boolean).sort((a, b) => b.rank - a.rank);
  if (first !== banner.shout) banner.left = BANNER.seconds;
  assign(banner, { shout: first, queue: rest.slice(0, BANNER.keep) });
};

/** Counts the slot down; when a shout ends the next in line takes over. Returns the shout on screen, or null. */
const stepBanner = (banner, dt) => {
  banner.left -= dt;
  if (banner.left <= 0) assign(banner, { shout: banner.queue.shift() || null, left: BANNER.seconds });
  return banner.shout;
};
const REFUSE_S = 0.3;
const COUNTDOWN_STEPS = 3;
// Juice for a cut: the duel loop freezes for `hitstop` s, then the camera shakes.
const SHOT = { shakeMs: 280, shake: 0.006, hitstop: 0.15 };
const FOCUS_EASE = 2;
// Without an AudioContext the SFX stay silent: the title's attract demo plays through this one.
const SILENCE = createSfx(null);
const EVENT_SOUNDS = { go: 'go', refused: 'refuse', dash: 'whoosh', power: 'power', shield: 'power' };

/** Tints every letter from cream at the top into `color` at the bottom: chunky arcade banner type. */
const shine = (text, color) => text.setTint(CREAM, CREAM, color, color);

const clockText = (seconds) => `${floor(seconds / 60)}:${String(floor(seconds % 60)).padStart(2, '0')}`;

/** Names, score (TIEMPO) or kites left (VIDAS), AIRE meters, active powers, the clock and the centre banner. */
class Hud {
  constructor(scene, names, kites, rules) {
    assign(this, { kites, rules, slot: createBanner(), refusedAt: [-REFUSE_S, -REFUSE_S], clock: 0 });
    this.g = scene.add.graphics();
    const side = (player, x) => (player ? W - x : x);
    const tags = names.map((name, player) => label(scene, side(player, HUD.margin), HUD.nameY, name, 1, PLAYER_COLORS[player]).setOrigin(player, 0.5));
    this.scores = [0, 1].map((player) => label(scene, side(player, HUD.margin), HUD.scoreY, '', 2).setOrigin(player, 0.5));
    this.powers = [0, 1].map((player) => label(scene, side(player, HUD.margin), HUD.powerY, '', 1, GLASS).setOrigin(player, 0.5));
    this.time = label(scene, W / 2, HUD.clockY, '', 2);
    // Banners sit above the fight (which happens around y 150-350) so they never hide a cut.
    this.banner = label(scene, W / 2, 124, '', 3);
    this.detail = label(scene, W / 2, 168, '', 1);
    this.left = (player) => side(player, HUD.margin + (player ? HUD.meterW : 0));
    this.objects = [this.g, ...tags, ...this.scores, ...this.powers, this.time, this.banner, this.detail];
  }

  /** Announces a moment in the banner slot, in a colour. */
  shout(kind, color = GOLD, detail = SHOUTS[kind][1]) {
    const [text, , rank] = SHOUTS[kind];
    announce(this.slot, { text, detail, rank, color });
  }

  /** Fills the banner: big text (shine-tinted when `color`), a detail line, and how big. */
  show(text, detail, color, scale = 1) {
    this.banner.setText(text).setScale(scale).setAlpha(1);
    if (color) shine(this.banner, color);
    this.detail.setText(detail);
  }

  /** JALAR pressed without enough AIRE: the meter flashes red. */
  refuse(player) {
    this.refusedAt[player] = this.clock;
  }

  update(duel, dt) {
    this.clock += dt;
    const g = this.g.clear();
    duel.kites.forEach((kite, player) => this.drawPlayer(g, duel, kite, player));
    const left = MATCH.time - duel.elapsed;
    const sudden = left <= 0;
    this.time.setText(duel.rules === 'tiempo' ? (sudden ? '¡MUERTE SÚBITA!' : clockText(left + 0.99)) : '');
    this.time.setTint(left < MATCH.double ? DANGER : CREAM).setScale(sudden ? 0.5 : 1);
    const shout = stepBanner(this.slot, dt);
    // JALA PARA SUBIR only once the calm has really started, when a JALAR visibly lifts the kite.
    const coming = windCue(duel) === 'calma' && weatherAt(duel).wind >= WIND.lull;
    const kind = coming ? 'viene' : windCue(duel);
    const cue = duel.phase === 'fly' && CUES[kind === 'calma' && duel.elapsed < MATCH.hint ? 'primera' : kind];
    if (duel.phase === 'countdown') {
      this.show(String(ceil((duel.clock / MATCH.countdown) * COUNTDOWN_STEPS)), duel.rules === 'tiempo' ? 'MÁS PUNTOS EN 1:30' : `${MATCH.lives} PAPAGAYOS CADA UNO`, GOLD);
    } else if (shout) this.show(shout.text, shout.detail, shout.color);
    else if (cue) {
      // A wind cue is smaller and blinks.
      this.show(cue.text, '', null, 2 / 3);
      this.banner.setTint(cue.color).setAlpha(0.55 + 0.45 * abs(sin(this.clock * 5)));
    }
    this.banner.setVisible(duel.phase === 'countdown' || Boolean(shout || cue));
    this.detail.setVisible(this.banner.visible);
  }

  drawPlayer(g, duel, kite, player) {
    const left = this.left(player);
    const refused = this.clock - this.refusedAt[player] < REFUSE_S;
    if (duel.rules === 'tiempo') this.scores[player].setText(String(duel.score[player]));
    else for (let pip = 0; pip < MATCH.lives; pip += 1) drawPapagayo(g, left + 10 + pip * HUD.pipGap, HUD.scoreY, 0, 0.36, this.kites[player], pip < duel.lives[player]);
    const ready = canPull(kite);
    rect(g, INK, left - 4, HUD.meterY - 4, HUD.meterW + 8, HUD.meterH + 8);
    rect(g, refused ? DANGER : ready ? PLAYER_COLORS[player] : DIM, left, HUD.meterY, floor((HUD.meterW * kite.air) / PIXEL) * PIXEL, HUD.meterH);
    const power = POWERS.find((kind) => kite[kind]);
    this.powers[player].setText(power ? `${power.toUpperCase()} ${power === 'nylon' ? '' : ceil(kite[power])}` : '');
  }
}

/**
 * The living city: backdrop, wind and the two kids (who may celebrate). Things in the sky are drawn on `back`,
 * in front of the azoteas on `front`. On its own it is the backdrop of the menus, with a breathing breeze.
 */
class Scenery {
  constructor(scene, looks, moods = []) {
    this.backdrop = new Backdrop(scene);
    this.back = scene.add.graphics();
    this.backdrop.addForeground();
    this.front = scene.add.graphics();
    this.wind = new WindParticles();
    this.flyers = looks.map((look, player) => new Flyer(player, look));
    moods.forEach((mood, player) => this.flyers[player].cheer(mood, Infinity));
    assign(this, { clock: 0, focus: W / 2 });
  }

  /** Moves the wind under `weather` and redraws it and the kids; returns the drift. */
  animate(weather, dt) {
    const drift = windDrift(weather);
    this.backdrop.update(this.focus);
    this.wind.update(drift, dt);
    this.wind.draw(this.back.clear(), drift);
    drawRooftops(this.front.clear(), this.flyers);
    return drift;
  }

  update(dt) {
    this.clock += dt;
    this.flyers.forEach((flyer) => flyer.pose(dt));
    this.animate({ wind: 1 + 0.4 * sin(this.clock * 0.5), gust: 80 * sin(this.clock * 0.3) }, dt);
  }
}

/**
 * Everything the duel shows on top of the city: zamuros, boxes, kites, effects, camera shakes and HUD.
 * Without player names it is the title's attract demo: no HUD, no camera moves and no sound.
 */
class DuelView extends Scenery {
  constructor(scene, names, looks, rules) {
    super(scene, looks);
    this.attract = !names;
    this.audio = this.attract ? SILENCE : sfx;
    this.camera = scene.cameras.main;
    this.fx = new Fx(scene);
    if (names) {
      const world = scene.children.list.slice();
      this.hud = new Hud(scene, names, looks.map(({ kite }) => kite), rules);
      // The HUD gets its own camera so shakes never move it.
      this.camera.ignore(this.hud.objects);
      pixelCamera(scene.cameras.add(0, 0, PW, PH)).ignore(world);
    }
  }

  update(duel, dt) {
    this.clock += dt;
    // The city feels the wind before the kites do: everything decorative shows the coming weather.
    const ahead = weatherAt(duel, duel.elapsed + WIND.lead);
    this.focus = lerp(this.focus, (duel.kites[0].x + duel.kites[1].x) / 2, min(1, dt * FOCUS_EASE));
    this.flyers.forEach((flyer, player) => {
      flyer.update(duel.kites[player], dt);
      if (flyer.fall) stepFall(flyer.fall, ahead, dt);
    });
    this.animate(ahead, dt);
    this.draw(duel, dt);
  }

  draw(duel, dt) {
    const { back, front, clock } = this;
    duel.zamuros.forEach(({ x, y, prey }) => {
      drawVulture(back, x, y, sin(clock * 12 + x * 0.05), 1);
      // An allied zamuro wears its side's colour.
      if (prey !== undefined) rect(back, PLAYER_COLORS[1 - prey], x - 6, y + 2, 12, 4);
    });
    duel.boxes.forEach((box) => drawBox(back, box, clock));
    this.flyers.forEach((flyer, player) => this.drawKite(duel.kites[player], duel.kites[1 - player], flyer));
    if (this.hud) this.hud.update(duel, dt);
  }

  /** A kite on its string (blinking while it rises or is guarded), plus the tumbling one it just lost. */
  drawKite(kite, rival, flyer) {
    const { front, clock } = this;
    const { fall, look } = flyer;
    if (fall) {
      drawTail(front, fall, look.kite.colors);
      drawPapagayo(front, fall.x, fall.y, fall.spin, 1, look.kite);
      if (fall.y > H + 100) flyer.fall = null;
    }
    if (!vulnerable(kite) && floor(clock * 12) % 2) return;
    drawString(front, flyer, kite, rival);
    drawTail(front, kite, look.kite.colors, 0.35 + 0.65 * abs(sin(flyer.clock * 5 + kite.player * 2)));
    drawShield(front, kite, clock);
    drawPapagayo(front, kite.x, kite.y, kiteAngle(kite, flyer), 1, look.kite);
  }

  /** Effects, camera work, banners and sounds for each duel event. */
  react(event, duel) {
    const { type, player, kind } = event;
    const kite = duel.kites[player];
    const [a, b] = duel.kites;
    const color = PLAYER_COLORS[player];
    const shout = (name, tint) => this.hud && this.hud.shout(name, tint);
    const reactions = {
      go: () => shout('go'),
      refused: () => this.hud && this.hud.refuse(player),
      dash: () => this.flyers[player].dash(),
      point: () => this.point(event, duel),
      clash: () => this.fx.sparks(20, (a.x + b.x) / 2, (a.y + b.y) / 2),
      stun: () => this.fx.sparks(10, kite.x, kite.y),
      power: () => {
        shout(kind, color);
        this.fx.sparks(24, kite.x, kite.y, 1);
      },
      shield: () => shout('shield', color),
      double: () => shout(type, DANGER),
      sudden: () => shout(type, DANGER),
      over: () => this.flyers.forEach((flyer, side) => flyer.cheer(side === event.winner ? 'win' : 'lose', Infinity)),
    };
    if (reactions[type]) reactions[type]();
    if (EVENT_SOUNDS[type]) this.audio.play(EVENT_SOUNDS[type]);
  }

  /** The lost kite tumbles away; a cut flashes warm where the string snapped, the cables spark, and the kids react. */
  point({ cause, loser, winner, value, kite }, duel) {
    if (this.hud) this.hud.shout(cause, winner === null ? CREAM : PLAYER_COLORS[winner], value > 1 ? '¡PUNTO DOBLE!' : '');
    if (winner === null) return;
    const flyer = this.flyers[loser];
    flyer.fall = createFall(kite);
    flyer.cheer('lose');
    this.flyers[winner].cheer('win');
    if (cause === 'cut') {
      const at = nearestOnSegment(duel.kites[winner].tail[TAIL.segments], kite.anchor, kite);
      this.fx.burst(0, at.x, at.y);
      this.audio.play('snap');
    } else if (cause === 'line') {
      this.fx.burst(1, kite.x, kite.y);
      this.audio.play('crackle');
    } else this.audio.play('thud');
    if (!this.attract) this.camera.shake(SHOT.shakeMs, SHOT.shake);
    this.audio.play('jingle');
  }
}

// ---------------------------------------------------------------------------
// 16. UI helpers
// ---------------------------------------------------------------------------

const MENU_GAP = 48;

/** Centred pixel-font text; `size` is how many screen pixels each font pixel takes (the font's size is its cell width). */
const label = (scene, x, y, text, size = 1, color = CREAM) =>
  scene.add.bitmapText(x, y, FONT.key, text, FONT.cell * PIXEL * size).setOrigin(0.5).setTint(color);

/** A dark box with a double pixel border. */
const panel = (scene, x, y, width, height) =>
  scene.add
    .graphics()
    .fillStyle(INK, 0.88)
    .fillRect(x, y, width, height)
    .lineStyle(4, GOLD)
    .strokeRect(x + 4, y + 4, width - 8, height - 8)
    .lineStyle(2, INK)
    .strokeRect(x + 1, y + 1, width - 2, height - 2);

/** Vertical joystick menu with a pixel arrow cursor; confirming locks it so a choice fires once. */
class Menu {
  constructor(scene, x, y, items, onSelect) {
    this.onSelect = onSelect;
    this.index = 0;
    this.locked = false;
    this.items = items.map((text, i) => label(scene, x, y + i * MENU_GAP, text, 2));
    this.cursor = scene.add.triangle(0, 0, 0, 0, 16, 10, 0, 20, GOLD).setStrokeStyle(4, INK);
    scene.tweens.add({ targets: this.cursor, scaleX: 0.5, duration: 260, yoyo: true, repeat: -1 });
    this.highlight();
  }

  handle(code) {
    if (this.locked) return;
    if (MENU_CODES.up.includes(code)) this.move(-1);
    else if (MENU_CODES.down.includes(code)) this.move(1);
    else if (MENU_CODES.confirm.includes(code)) this.confirm();
  }

  move(step) {
    this.index = (this.index + step + this.items.length) % this.items.length;
    this.highlight();
  }

  confirm() {
    this.locked = true;
    this.onSelect(this.index);
  }

  /** Reuses the menu for a new question with as many options. */
  ask(items, onSelect) {
    this.items.forEach((item, i) => item.setText(items[i]));
    assign(this, { onSelect, index: 0, locked: false });
    this.highlight();
  }

  highlight() {
    this.items.forEach((item, i) => item.setTint(i === this.index ? GOLD : CREAM));
    const item = this.items[this.index];
    this.cursor.setPosition(item.x - item.displayWidth / 2 - 30, item.y);
  }
}

// ---------------------------------------------------------------------------
// 17. Scenes
// ---------------------------------------------------------------------------

const BOARD = { x: 110, y: 436, width: 580, height: 136, row: 19 };

/** Top-five table in the bottom panel; returns fill(), which repaints it and can highlight one rank. */
const addBoard = (scene, entries = Leaderboard.sanitize(null), highlight = -1) => {
  panel(scene, BOARD.x, BOARD.y, BOARD.width, BOARD.height);
  label(scene, W / 2, BOARD.y + 24, 'MEJORES PAPAGAYEROS', 1, GOLD);
  const rows = range(LEADERBOARD_SIZE, (i) => label(scene, W / 2, BOARD.y + 48 + i * BOARD.row, ''));
  const fill = (list) =>
    list.forEach(({ name, score }, i) => {
      rows[i].setText(`${i + 1}. ${name}   ${score}`).setTint(i === highlight ? PLAYER_COLORS[0] : CREAM);
      if (i === highlight) scene.tweens.add({ targets: rows[i], alpha: 0.3, duration: 260, yoyo: true, repeat: -1 });
    });
  fill(entries);
  return fill;
};

/** A human pilot reads the held joystick and buttons; JALAR fires once per press and lifts while held. */
class HumanPilot {
  constructor(player) {
    this.codes = PLAYER_CODES[player];
  }

  input(duel, pressed) {
    const held = (code) => (Arcade.held.has(this.codes[code]) ? 1 : 0);
    return {
      ax: held('right') - held('left'),
      ay: held('down') - held('up'),
      dash: pressed.has(this.codes.dash),
      hold: held('dash') === 1,
      reel: held('reel') === 1,
    };
  }
}

/** A CPU pilot plays a ladder rival; `spar` overrides some of its stats (the attract demo's bolder style). */
class CpuPilot {
  constructor(level, player, spar) {
    this.cpu = createCpu(level, player, makeRng(Date.now() + player));
    this.cpu.spec = { ...this.cpu.spec, ...spar };
  }

  input(duel) {
    return cpuInput(this.cpu, duel, DT);
  }
}

// Caps the catch-up after a stalled frame so the simulation never spirals.
const MAX_LAG = 0.1;

/** Runs a duel at a fixed step, feeding every event to the view and a listener; a cut freezes it for a beat. */
class DuelLoop {
  constructor(duel, pilots, view, listen) {
    assign(this, { duel, pilots, view, listen, pressed: new Set(), lag: 0, hitstop: 0 });
  }

  press(codes) {
    codes.forEach((code) => this.pressed.add(code));
  }

  update(dt) {
    const frozen = this.hitstop > 0;
    this.hitstop -= dt;
    if (!frozen) {
      this.lag = min(this.lag + dt, MAX_LAG);
      while (this.lag >= DT) {
        this.lag -= DT;
        this.tick();
      }
    }
    this.view.update(this.duel, frozen ? 0 : dt);
  }

  tick() {
    const inputs = this.pilots.map((pilot) => pilot.input(this.duel, this.pressed));
    this.pressed.clear();
    inputs.forEach(({ dash }, player) => {
      if (dash && this.duel.phase === 'fly' && !canPull(this.duel.kites[player])) this.view.react({ type: 'refused', player });
    });
    for (const event of stepDuel(this.duel, inputs, DT)) {
      this.view.react(event, this.duel);
      if (event.cause === 'cut') this.hitstop = SHOT.hitstop;
      this.listen(event);
    }
  }
}

// The attract demo: two CPU sparring partners fight behind the menu (bolder than any ladder rival, so a point
// comes every few seconds) and start over after each match. Left idle for `idleMs`, the title plays the opening.
const ATTRACT = { levels: [3, 5], rules: 'vidas', restartMs: 2500, idleMs: 30000, spar: { aggression: 1, guard: 0, pace: 1, stroke: 90 } };
const LOGO = { y: 84, size: 5, sway: 0.04, swayMs: 1800 };
const RULE_NAMES = ['TIEMPO', 'VIDAS'];
const attractLooks = () => ATTRACT.levels.map((level) => RIVAL_LOOKS[level]);

/** The ¡HOJILLAZO! logo: warm chunky letters with a hard drop shadow over GUERRA DE PAPAGAYOS, swaying like a kite. */
const addLogo = (scene) => {
  const [shadow, logo] = [PIXEL * 4, 0].map((offset) => label(scene, offset, offset, '¡HOJILLAZO!', LOGO.size, INK));
  shine(logo, 0xff7a2f);
  const subtitle = shine(label(scene, 0, LOGO.y, 'GUERRA DE PAPAGAYOS', 2), GOLD);
  const container = scene.add.container(W / 2, LOGO.y, [shadow, logo, subtitle]);
  scene.tweens.add({ targets: container, rotation: { from: -LOGO.sway, to: LOGO.sway }, duration: LOGO.swayMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return container;
};

class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    Arcade.drain();
    this.idle = 0;
    this.view = new DuelView(this, null, attractLooks());
    this.startDemo();
    addLogo(this);
    // First how many players, then the match rules.
    this.menu = new Menu(this, W / 2, 250, ['1 JUGADOR', '2 JUGADORES'], (players) =>
      this.menu.ask(RULE_NAMES, (rule) => this.scene.start('HowTo', { mode: players ? 'versus' : 'solo', rules: RULES[rule] })),
    );
    const fill = addBoard(this);
    Leaderboard.load().then((entries) => this.sys.isActive() && fill(entries));
    label(this, W / 2, 586, 'PLATANUS HACK 26 · CARACAS', 1, DIM);
  }

  startDemo() {
    this.view.flyers.forEach((flyer) => flyer.cheer(null, 0));
    const pilots = ATTRACT.levels.map((level, player) => new CpuPilot(level, player, ATTRACT.spar));
    this.demo = new DuelLoop(createDuel(makeRng(Date.now()), ATTRACT.rules), pilots, this.view, ({ type }) => {
      if (type === 'over') this.time.delayedCall(ATTRACT.restartMs, () => this.startDemo());
    });
  }

  update(time, delta) {
    this.demo.update(delta / 1000);
    const presses = Arcade.drain();
    presses.forEach((code) => this.menu.handle(code));
    this.idle = presses.length ? 0 : this.idle + delta;
    if (this.idle > ATTRACT.idleMs) this.scene.start('Opening');
  }
}

// The opening, in seconds: fade in on the sun and pull back over Caracas; the kid launches, the rival rises, the
// kid saws across its string until it snaps; then the logo slams in where the title shows it. Any button skips.
const OPENING = { fadeMs: 1200, pull: 2.4, launch: 2.2, rival: 3.2, saw: 4.8, cut: 6.2, slam: 7, end: 9.2, stroke: 45, strokeRate: 10, seed: 26 };
// Kite paths as [second, x, y] keys: the kid's kite climbs and swoops onto the rival string; the rival's climbs and holds.
const OPENING_PATHS = [
  [[OPENING.launch, 170, 500], [OPENING.launch + 1.4, 280, 230], [OPENING.saw, 523, 217], [OPENING.slam, 440, 170]],
  [[OPENING.rival, 630, 500], [OPENING.rival + 1.4, 380, 170]],
];

/** Position along [second, x, y] keys at time t, eased in and out between keys and held at both ends. */
const track = (keys, t) => {
  const next = keys.findIndex(([at]) => at > t);
  if (next < 1) {
    const [, x, y] = keys[next < 0 ? keys.length - 1 : 0];
    return { x, y };
  }
  const [t0, x0, y0] = keys[next - 1];
  const [t1, x1, y1] = keys[next];
  const u = (t - t0) / (t1 - t0);
  const eased = u * u * (3 - 2 * u);
  return { x: lerp(x0, x1, eased), y: lerp(y0, y1, eased) };
};

/** The attract cinematic on boot (and after an idle title), built from the duel's own pieces. */
class OpeningScene extends Phaser.Scene {
  constructor() {
    super('Opening');
  }

  create() {
    Arcade.drain();
    assign(this, { clock: 0, severed: false, logo: null });
    this.view = new DuelView(this, null, attractLooks());
    this.duel = createDuel(makeRng(OPENING.seed));
    this.duel.kites.forEach((kite, player) => {
      assign(kite, track(OPENING_PATHS[player], 0));
      hangTail(kite);
    });
    const pull = OPENING.pull * 1000;
    this.cameras.main.setZoom(1).centerOn(SUN.x + 80, SUN.y).fadeIn(OPENING.fadeMs).pan(W / 2, H / 2, pull, 'Sine.easeInOut').zoomTo(1 / PIXEL, pull, 'Sine.easeInOut');
  }

  update(time, delta) {
    const dt = delta / 1000;
    const clock = (this.clock += dt);
    const { duel } = this;
    duel.elapsed += dt;
    const weather = weatherAt(duel);
    const [mine, rival] = duel.kites;
    const sawing = clock > OPENING.saw && clock < OPENING.cut;
    this.fly(mine, OPENING_PATHS[0], sawing ? sin((clock - OPENING.saw) * OPENING.strokeRate) * OPENING.stroke : 0, weather, dt);
    if (this.severed) stepKite(rival, IDLE_INPUT, weather, dt);
    else {
      this.fly(rival, OPENING_PATHS[1], 0, weather, dt);
      rival.fray = FRAY.toughness * 0.9 * clamp01((clock - OPENING.saw) / (OPENING.cut - OPENING.saw));
    }
    if (clock >= OPENING.cut && !this.severed) this.cut();
    if (clock >= OPENING.slam && !this.logo) this.slam();
    this.view.update(duel, dt);
    if (Arcade.drain().length || clock >= OPENING.end) this.scene.start('Title');
  }

  /** Puts a kite on its scripted path (plus a sideways saw stroke); its tail swings behind it for real. */
  fly(kite, keys, stroke, weather, dt) {
    const { x, y } = track(keys, this.clock);
    assign(kite, { vx: (x + stroke - kite.x) / dt, vy: (y - kite.y) / dt, x: x + stroke, y });
    kite.len = distance(kite, kite.anchor);
    stepTail(kite, weather, dt);
  }

  /** The string snaps as in a duel, and a new rival kite starts climbing from its rooftop. */
  cut() {
    const { duel, view } = this;
    this.severed = true;
    view.react({ type: 'point', cause: 'cut', loser: 1, winner: 0, value: 1, kite: duel.kites[1] }, duel);
    duel.kites[1] = respawnKite(1);
    this.cameras.main.shake(SHOT.shakeMs, SHOT.shake);
  }

  /** The logo drops in from huge and lands with a shake and a shower of sparks. */
  slam() {
    this.logo = addLogo(this).setScale(4).setAlpha(0);
    this.tweens.add({
      targets: this.logo,
      scale: 1,
      alpha: 1,
      duration: 280,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.cameras.main.shake(SHOT.shakeMs, SHOT.shake * 2);
        this.view.fx.sparks(60, W / 2, LOGO.y + 30);
      },
    });
  }
}

/** Scenes over the living backdrop: input is drained on entry and idle time builds up while nobody presses. */
class BackdropScene extends Phaser.Scene {
  stage(looks, moods) {
    Arcade.drain();
    this.idle = 0;
    this.scenery = new Scenery(this, looks, moods);
  }

  update(time, delta) {
    this.scenery.update(delta / 1000);
    const presses = Arcade.drain();
    this.idle = presses.length ? 0 : this.idle + delta;
    this.step(presses, delta);
  }
}

// CÓMO JUGAR: shown after choosing the rules, before building the papagayero; B1/START or `ms` moves on.
const HOWTO = { ms: 8000, cabinetY: 180, legendY: 312, lineGap: 42, goalY: 432, powersY: 470, powerGap: 170 };
// One player's half of the cabinet: the joystick, then two rows of three numbered buttons (the bottom row is
// unused). The real button colours are unknown, so they are drawn neutral and always named by number.
const PANEL = { width: 300, height: 160, plate: 0x3a2a50, stick: -95, buttons: -15, gap: 58, row: 58, radius: 20, cap: 0xe4dccf };
// Keyboard keys for web players, per player: joystick, B1, B2.
const KEY_HINTS = [
  ['WASD', 'U', 'I'],
  ['FLECHAS', 'R', 'T'],
];
const CONTROLS = ['JOYSTICK: DIRIGIR', 'B1: JALAR (MANTÉN PARA SUBIR)', 'B2: RECOGER'];
// What each power box does, in one word (in POWERS order).
const POWER_WORDS = ['CORTA', 'RÁPIDO', 'ESCUDO', 'ATACA'];

/** One player's cabinet controls around (x, y), with B1 and B2 ringed in its colour and its keyboard keys above. */
const drawControls = (scene, g, x, y, player) => {
  const color = PLAYER_COLORS[player];
  const [stickKeys, ...buttonKeys] = KEY_HINTS[player];
  const stick = x + PANEL.stick;
  rect(g, PANEL.plate, x - PANEL.width / 2, y - 60, PANEL.width, PANEL.height);
  g.fillStyle(INK).fillCircle(stick, y + 40, 30).fillStyle(PANEL.plate).fillCircle(stick, y + 40, 24);
  rect(g, INK, stick - 4, y + 4, 8, 36);
  g.fillStyle(INK).fillCircle(stick, y + 4, 17).fillStyle(PANEL.cap).fillCircle(stick, y + 4, 13);
  label(scene, stick, y - 42, stickKeys, 1, color);
  for (let i = 0; i < 6; i += 1) {
    const bx = x + PANEL.buttons + (i % 3) * PANEL.gap;
    const by = y + floor(i / 3) * PANEL.row;
    const alpha = i < 3 ? 1 : 0.4;
    if (i < 2) {
      g.lineStyle(4, color).strokeCircle(bx, by, PANEL.radius + 6);
      label(scene, bx, by - 42, buttonKeys[i], 1, color);
    }
    g.fillStyle(INK, alpha).fillCircle(bx, by, PANEL.radius + 2).fillStyle(PANEL.cap, alpha).fillCircle(bx, by, PANEL.radius);
    label(scene, bx, by, String(i + 1), 1, INK).setAlpha(alpha);
  }
};

class HowToScene extends BackdropScene {
  constructor() {
    super('HowTo');
  }

  init({ mode, rules }) {
    assign(this, { setup: { mode, rules }, elapsed: 0, leaving: false });
  }

  create() {
    const { mode } = this.setup;
    const players = mode === 'solo' ? [0] : [0, 1];
    this.stage(looksOf(lineup(mode, 0, DEFAULT_CHOICES)));
    panel(this, 30, 80, W - 60, 482);
    shine(label(this, W / 2, 46, 'CÓMO JUGAR', 3), GOLD);
    const g = this.add.graphics();
    players.forEach((player) => {
      const x = players.length > 1 ? 210 + player * 380 : W / 2;
      label(this, x, HOWTO.cabinetY - 80, `JUGADOR ${player + 1}`, 1, PLAYER_COLORS[player]);
      drawControls(this, g, x, HOWTO.cabinetY, player);
    });
    CONTROLS.forEach((text, i) => label(this, W / 2, HOWTO.legendY + i * HOWTO.lineGap, text, 2));
    label(this, W / 2, HOWTO.goalY, 'SERRUCHA EL HILO RIVAL CON TU COLA', 1, GOLD);
    POWERS.forEach((kind, i) => {
      const x = W / 2 + (i - 1.5) * HOWTO.powerGap;
      drawBox(g, { x, y: HOWTO.powersY, kind }, 0);
      label(this, x, HOWTO.powersY + 36, kind.toUpperCase(), 1, GLASS);
      label(this, x, HOWTO.powersY + 56, POWER_WORDS[i]);
    });
    label(this, W / 2, 586, 'B1 / START: ¡VAMOS!', 1, DIM);
  }

  step(presses, delta) {
    this.elapsed += delta;
    const skipped = presses.some((code) => MENU_CODES.confirm.includes(code));
    if (this.leaving || (!skipped && this.elapsed < HOWTO.ms)) return;
    this.leaving = true;
    this.scene.start('Build', this.setup);
  }
}

// "ARMA TU PAPAGAYERO": each player builds a look before playing; the last choice is remembered.
const BUILD = { top: 92, height: 386, width: 372, rowsY: 150, rowGap: 52, idleMs: 30000, leaveMs: 700, preview: 2.1 };
const ROW_TITLES = ['CHAMO / CHAMA', 'PEINADO', 'PIEL', 'FRANELA', 'PAPAGAYO'];

/** Text for a row's value: names for body and hair, a counter for colours and kites (the preview shows them). */
const rowValue = (choice, row) => {
  if (row === 'body') return BODY_NAMES[choice.body];
  if (row === 'hair') return HAIR_NAMES[choice.hair];
  return `${choice[row] + 1} / ${ROW_SIZES[row]}`;
};

/** Hanging tail points under a kite drawn outside the duel (menus and cards). */
const restingTail = (x, y, clock) =>
  range(TAIL.segments + 1, (i) => ({ x: x + sin(clock * 2 + i * 0.6) * i * 0.7, y: y + KITE.radius + i * TAIL.segment * 0.8 }));

/** A large, standing avatar holding its kite string toward (kite.x, kite.y). */
const drawPortrait = (g, look, { x, y, scale, side, mood, clock }, kite) => {
  const reach = scale * look.scale;
  const hand = { x: x + side * 14 * reach, y: y - 50 * reach };
  g.lineStyle(2, CREAM).lineBetween(hand.x, hand.y, kite.x, kite.y + 20);
  drawTail(g, { tail: restingTail(kite.x, kite.y, clock) }, look.kite.colors);
  drawPapagayo(g, kite.x, kite.y, sin(clock * 1.5) * 0.1, 0.8, look.kite);
  drawAvatar(g, look, { x, y, scale, side, mood, expression: mood || 'focus', lift: 0, yank: 0, clock, hand });
};

class BuildScene extends BackdropScene {
  constructor() {
    super('Build');
  }

  init({ mode, rules }) {
    assign(this, { mode, rules, clock: 0, touched: false, leaving: false });
  }

  create() {
    this.choices = sanitizeChoices(null);
    this.players = this.mode === 'solo' ? [0] : [0, 1];
    this.stage(looksOf(lineup(this.mode, 0, this.choices)));
    shine(label(this, W / 2, 46, 'ARMA TU PAPAGAYERO', 3), GOLD);
    this.columns = this.players.map((player) => this.addColumn(player, this.players.length === 1 ? W / 2 : 200 + player * 400));
    this.g = this.add.graphics();
    label(this, W / 2, 586, 'JOYSTICK: ELEGIR · B1: ¡LISTO!', 1, DIM);
    AvatarStore.load().then((stored) => {
      if (!this.sys.isActive() || this.touched) return;
      this.choices = stored;
      this.players.forEach((player) => this.refresh(player));
    });
    this.players.forEach((player) => this.refresh(player));
  }

  addColumn(player, x) {
    const half = BUILD.width / 2;
    panel(this, x - half, BUILD.top, BUILD.width, BUILD.height);
    label(this, x, BUILD.top + 26, `JUGADOR ${player + 1}`, 1, PLAYER_COLORS[player]);
    const rowX = x + 86;
    const values = LOOK_ROWS.map((row, i) => {
      const y = BUILD.rowsY + i * BUILD.rowGap;
      label(this, rowX, y, ROW_TITLES[i], 1, DIM);
      return label(this, rowX, y + 22, '');
    });
    const status = label(this, x, BUILD.top + BUILD.height - 28, '', 2);
    return { x, rowX, values, status, row: 0, ready: false };
  }

  refresh(player) {
    const column = this.columns[player];
    const choice = this.choices[player];
    column.values.forEach((value, i) => {
      const text = rowValue(choice, LOOK_ROWS[i]);
      const selected = i === column.row && !column.ready;
      value.setText(selected ? `‹ ${text} ›` : text).setTint(selected ? GOLD : CREAM);
    });
    column.status.setText(column.ready ? '¡LISTO!' : 'B1: ¡LISTO!').setTint(column.ready ? 0x7dff8a : DIM);
    this.scenery.flyers[player].look = resolveLook(choice, player);
  }

  handle(player, code) {
    const column = this.columns[player];
    const codes = PLAYER_CODES[player];
    if (column.ready) return;
    this.touched = true;
    if (code === codes.up || code === codes.down) column.row = (column.row + (code === codes.up ? -1 : 1) + LOOK_ROWS.length) % LOOK_ROWS.length;
    else if (code === codes.left || code === codes.right) {
      this.choices[player] = cycleChoice(this.choices[player], LOOK_ROWS[column.row], code === codes.left ? -1 : 1);
    } else if (code === codes.dash || code === codes.start) column.ready = true;
    this.refresh(player);
  }

  /** Everyone is ready: remember the looks and go on to the ladder (solo) or the duel (versus). */
  finish() {
    this.leaving = true;
    const { choices, mode, rules } = this;
    AvatarStore.save(choices);
    this.time.delayedCall(BUILD.leaveMs, () =>
      this.scene.start(mode === 'solo' ? 'Intro' : 'Duel', { mode, rules, level: 0, total: 0, choices }),
    );
  }

  step(presses, delta) {
    this.clock += delta / 1000;
    if (this.leaving) return;
    presses.forEach((code) => this.players.forEach((player) => this.handle(player, code)));
    if (this.idle > BUILD.idleMs) this.players.forEach((player) => this.handle(player, PLAYER_CODES[player].start));
    this.draw();
    if (this.columns.every((column) => column.ready)) this.finish();
  }

  draw() {
    const g = this.g.clear();
    this.columns.forEach((column, player) => {
      const look = resolveLook(this.choices[player], player);
      const side = player === 0 ? 1 : -1;
      const x = column.x - 96;
      const mood = column.ready ? 'win' : null;
      drawPortrait(g, look, { x, y: BUILD.top + BUILD.height - 46, scale: BUILD.preview, side, mood, clock: this.clock }, { x: x + side * 40, y: BUILD.top + 78 });
    });
  }
}

const INTRO_MS = 3200;
// Names longer than `longName` letters drop to a smaller size to fit beside the portrait.
const CARD = { left: 100, top: 150, width: 600, height: 280, textX: 480, land: 230, longName: 10 };
// One landscape strip per rival's home, along the foot of the card: [ground colour, feature].
const HOMES = [
  [0x3a2240, 'ranchos'],
  [0x3f6a3a, 'andes'],
  [0xc89a5a, 'cardones'],
  [0x2a7ab0, 'mar'],
  [0x2a5a90, 'puente'],
  [0x3a2240, 'ranchos'],
];

/** The rival's home along the foot of the card: ranchos, snowy Andes, cardones, the sea or the lake bridge. */
const drawHome = (g, level, left, bottom, width) => {
  const [ground, feature] = HOMES[level];
  const rng = makeRng(level + 1);
  rect(g, ground, left, bottom - 24, width, 24);
  for (let x = left + 10; x < left + width - 20; x += 28 + rng() * 20) {
    const y = bottom - 24;
    if (feature === 'ranchos') rect(g, RANCHOS[floor(rng() * RANCHOS.length)], x, y - 14, 18, 14);
    else if (feature === 'andes') g.fillStyle(0x6a5a8a).fillTriangle(x - 20, y, x + 10, y - 60, x + 40, y).fillStyle(CREAM).fillTriangle(x + 2, y - 48, x + 10, y - 60, x + 18, y - 48);
    else if (feature === 'cardones') rect(g, 0x3f7a3a, x, y - 40, 8, 40).fillRect(x - 10, y - 26, 10, 6).fillRect(x - 10, y - 34, 4, 10);
    else if (feature === 'mar') rect(g, CREAM, x, y + 8, 12, 2);
    else rect(g, 0xd8d0c0, x, y - 30, 4, 30).fillRect(x - 30, y - 12, 60, 4);
  }
};

/** Ladder card before each solo duel: who the next rival is (look, kite, home, catchphrase) and the points so far. */
class IntroScene extends BackdropScene {
  constructor() {
    super('Intro');
  }

  init({ level, total, rules, choices = DEFAULT_CHOICES }) {
    assign(this, { level, total, rules, choices, elapsed: 0, leaving: false });
  }

  create() {
    this.cast = lineup('solo', this.level, this.choices);
    this.stage(looksOf(this.cast));
    const { name, home, motto } = RIVALS[this.level];
    const { left, top, width, height, textX } = CARD;
    const card = this.add.container(0, 0, [
      panel(this, left, top, width, height),
      label(this, textX, top + 38, `RIVAL ${this.level + 1} DE ${RIVALS.length}`, 2, GOLD),
      label(this, textX, top + 96, name, name.length > CARD.longName ? 2 : 3, PLAYER_COLORS[1]),
      label(this, textX, top + 146, `DE ${home}`, 1),
      label(this, textX, top + 184, motto, 1, GOLD),
      label(this, textX, top + 240, `PUNTOS ${this.total}`),
    ]);
    this.portrait = this.add.graphics();
    card.addAt(this.portrait, 1);
    this.tweens.add({ targets: card, alpha: { from: 0, to: 1 }, y: { from: 40, to: 0 }, duration: 420, ease: 'Back.easeOut' });
  }

  step(presses, delta) {
    this.elapsed += delta;
    const clock = this.elapsed / 1000;
    const { left, top, height } = CARD;
    const g = this.portrait.clear();
    drawHome(g, this.level, left + 8, top + height - 8, CARD.land);
    // The rival looks up at its kite in the card's corner, away from the text.
    const pose = { x: left + 140, y: top + height - 16, scale: 1.9, side: -1, mood: null, clock };
    drawPortrait(g, this.cast[1].look, pose, { x: left + 48, y: top + 56 });
    const skipped = presses.some((code) => MENU_CODES.confirm.includes(code));
    if (this.leaving || (!skipped && this.elapsed < INTRO_MS)) return;
    this.leaving = true;
    const { level, total, rules, choices } = this;
    this.scene.start('Duel', { mode: 'solo', level, total, rules, choices });
  }
}

const RESULT_DELAY_MS = 1200;

class DuelScene extends Phaser.Scene {
  constructor() {
    super('Duel');
  }

  init({ mode, rules, level = 0, total = 0, choices = DEFAULT_CHOICES }) {
    assign(this, { mode, rules, level, total, choices, earned: 0, stats: createStats() });
  }

  create() {
    Arcade.drain();
    const solo = this.mode === 'solo';
    const cast = lineup(this.mode, this.level, this.choices);
    this.names = namesOf(cast);
    const pilots = [new HumanPilot(0), solo ? new CpuPilot(this.level, 1) : new HumanPilot(1)];
    const view = new DuelView(this, this.names, looksOf(cast), this.rules);
    const lull = solo ? ladderLull(this.level) : LULLS.versus;
    this.loop = new DuelLoop(createDuel(makeRng(Date.now()), this.rules, lull), pilots, view, (event) => this.record(event));
  }

  record(event) {
    tally(this.stats, event);
    if (event.type === 'point' && this.mode === 'solo') this.earned += pointScore(event);
    if (event.type === 'over') this.time.delayedCall(RESULT_DELAY_MS, () => this.finish());
  }

  update(time, delta) {
    this.loop.press(Arcade.drain());
    this.loop.update(delta / 1000);
  }

  finish() {
    const { mode, rules, level, names, stats, total, choices } = this;
    const { winner, score } = this.loop.duel;
    const earned = this.earned + (mode === 'solo' ? matchBonus(winner, score, level) : 0);
    this.scene.start('Result', { mode, rules, level, names, stats, winner, score: [...score], earned, total: total + earned, choices });
  }
}

const RESULT_IDLE_MS = 25000;
const INITIALS_IDLE_MS = 30000;
const OUTCOME_TITLES = { next: '¡GANASTE!', champion: '¡REY DEL CIELO!', defeat: '¡TE GANARON!' };
const STAT_ROWS = [
  ['CORTES', 'cuts'],
  ['CHOQUES', 'crashes'],
  ['JALONES', 'dashes'],
];
const STAT_COLUMNS = [300, 500];
const STATS_Y = 166;
const INITIALS = { length: 3, y: 420, gap: 64 };

/**
 * The end of a match: who won and the stats; then REVANCHA (versus), the next rival (solo win), or the
 * leaderboard, with initials written right here when the total makes it.
 */
class ResultScene extends BackdropScene {
  constructor() {
    super('Result');
  }

  init(summary) {
    assign(this, { summary, state: 'wait', letters: Array(INITIALS.length).fill('A'), cursor: 0 });
  }

  create() {
    const { mode, level, winner, total, earned, choices = DEFAULT_CHOICES } = this.summary;
    this.outcome = mode === 'solo' ? ladderOutcome(winner, level) : 'versus';
    this.stage(looksOf(lineup(mode, level, choices)), [0, 1].map((player) => (player === winner ? 'win' : 'lose')));
    shine(label(this, W / 2, 70, this.title(), 3), PLAYER_COLORS[winner]);
    label(this, W / 2, 116, this.subtitle(), 1, GOLD);
    this.addStats();
    if (mode === 'versus') {
      this.state = 'menu';
      this.menu = new Menu(this, W / 2, 360, ['REVANCHA', 'MENÚ PRINCIPAL'], (index) =>
        index === 0 ? this.leave('Duel', this.summary) : this.leave('Title'),
      );
      return;
    }
    label(this, W / 2, 334, `TOTAL ${total}  (+${earned})`, 2);
    if (this.outcome === 'next') this.prompt('PULSA START PARA SEGUIR', 'next');
    else Leaderboard.load().then((entries) => (Leaderboard.qualifies(entries, total) ? this.askInitials() : this.showBoard(entries)));
  }

  title() {
    const { winner, names } = this.summary;
    return this.outcome === 'versus' ? `¡GANÓ ${names[winner]}!` : OUTCOME_TITLES[this.outcome];
  }

  subtitle() {
    const { level, names, score } = this.summary;
    if (this.outcome === 'next') return `PRÓXIMO: ${RIVALS[level + 1].name} · DE ${RIVALS[level + 1].home}`;
    if (this.outcome === 'champion') return `VENCISTE A LOS ${RIVALS.length} PAPAGAYEROS DE VENEZUELA`;
    if (this.outcome === 'defeat') return `${names[1]} SE QUEDA CON EL CIELO`;
    return `${score[0]} - ${score[1]}`;
  }

  /** CORTES / CHOQUES / JALONES / PUNTOS for both players. */
  addStats() {
    const { names, stats, score } = this.summary;
    const rows = [...STAT_ROWS.map(([title, key]) => [title, stats.map((player) => player[key])]), ['PUNTOS', score]];
    panel(this, 190, STATS_Y - 12, 420, 140);
    STAT_COLUMNS.forEach((x, player) => label(this, x, STATS_Y + 8, names[player], 1, PLAYER_COLORS[player]));
    rows.forEach(([title, values], i) => {
      const y = STATS_Y + 36 + i * 22;
      label(this, W / 2, y, title, 1, DIM);
      STAT_COLUMNS.forEach((x, player) => label(this, x, y, String(values[player])));
    });
  }

  prompt(text, state) {
    this.state = state;
    const prompt = label(this, W / 2, 400, text);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
  }

  /** A qualifying total: three letters to write right below the stats. */
  askInitials() {
    if (!this.sys.isActive()) return;
    this.state = 'initials';
    this.idle = 0;
    this.slots = this.letters.map((letter, i) => label(this, W / 2 + (i - 1) * INITIALS.gap, INITIALS.y, letter, 4));
    this.caret = this.add.rectangle(0, INITIALS.y + 40, 44, 8, GOLD);
    this.help = [
      label(this, W / 2, 372, '¡NUEVO RÉCORD! ESCRIBE TUS INICIALES', 1, PLAYER_COLORS[0]),
      label(this, W / 2, 486, 'JOYSTICK: LETRA Y POSICIÓN · B1: SIGUIENTE', 1, DIM),
    ];
    this.refresh();
  }

  showBoard(entries, rank) {
    if (!this.sys.isActive()) return;
    // The board gets its own idle time, even right after initials that timed out.
    this.idle = 0;
    addBoard(this, entries, rank);
    this.prompt('PULSA START', 'board');
  }

  leave(key, data) {
    this.state = 'gone';
    this.scene.start(key, data);
  }

  proceed() {
    const { level, total, rules, choices } = this.summary;
    if (this.outcome === 'next') this.leave('Intro', { level: level + 1, total, rules, choices });
    else this.leave('Title');
  }

  step(presses) {
    const { state } = this;
    if (state === 'initials') {
      presses.forEach((code) => this.write(code));
      if (this.idle > INITIALS_IDLE_MS) this.submit();
      return;
    }
    if (state === 'menu') presses.forEach((code) => this.menu.handle(code));
    else if ((state === 'next' || state === 'board') && presses.some((code) => MENU_CODES.confirm.includes(code))) this.proceed();
    // Walking away abandons the ladder or the rematch.
    if (this.state !== 'gone' && this.idle > RESULT_IDLE_MS) this.leave('Title');
  }

  write(code) {
    if (this.state !== 'initials') return;
    const step = (codes) => (codes.includes(code) ? 1 : 0);
    const turn = step(MENU_CODES.up) - step(MENU_CODES.down);
    if (turn) this.letters[this.cursor] = shiftLetter(this.letters[this.cursor], turn);
    this.cursor = Phaser.Math.Clamp(this.cursor + step(MENU_CODES.right) - step(MENU_CODES.left), 0, INITIALS.length - 1);
    if (MENU_CODES.confirm.includes(code)) {
      if (this.cursor < INITIALS.length - 1) this.cursor += 1;
      else this.submit();
    }
    this.refresh();
  }

  refresh() {
    this.slots.forEach((slot, i) => slot.setText(this.letters[i]).setTint(i === this.cursor ? GOLD : CREAM));
    this.caret.setX(this.slots[this.cursor].x);
  }

  async submit() {
    this.state = 'saving';
    const { entries, rank } = await Leaderboard.record({ name: this.letters.join(''), score: this.summary.total });
    [...this.slots, ...this.help, this.caret].forEach((part) => part.destroy());
    this.showBoard(entries, rank);
  }
}

// ---------------------------------------------------------------------------
// 18. Boot
// ---------------------------------------------------------------------------

new Phaser.Game({
  type: Phaser.AUTO,
  width: PW,
  height: PH,
  pixelArt: true,
  parent: 'game-root',
  backgroundColor: INK,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [OpeningScene, TitleScene, HowToScene, BuildScene, IntroScene, DuelScene, ResultScene],
});
})();
