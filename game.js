// ¡Papagayos! — Platanus Hack 26 Caracas Edition
// Kite duel over Caracas: sweep your tail's blade across the rival's string to cut it.

// The whole game lives in one function scope (left unindented) so the minifier can shorten every name.
(() => {

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

// Short names for the Math functions used everywhere.
const { sin, cos, max, min, abs, PI, sign, hypot, floor, round, exp, ceil, atan2 } = Math;
const TAU = PI * 2;

const W = 800;
const H = 600;
const FONT = '"Arial Black", "Arial Bold", Arial, sans-serif';

// Palette shared by the art and the UI; the player colours also identify each side in the HUD.
const INK = 0x1a0f22;
const GOLD = 0xffc04d;
const CREAM = 0xfff3d6;
const DIM = 0xb7a6d8;
const DANGER = 0xff3b4e;
const PLAYER_COLORS = [0xffd23f, 0x3fd2ff];

const css = (color) => `#${color.toString(16).padStart(6, '0')}`;

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

class SafeStorage {
  constructor(backends) {
    this.backends = backends;
  }

  async get(key) {
    for (const backend of this.backends) {
      try {
        return await backend.get(key);
      } catch {
        // Try the next backend.
      }
    }
  }

  async set(key, value) {
    for (const backend of this.backends) {
      try {
        await backend.set(key, value);
        return;
      } catch {
        // Try the next backend.
      }
    }
  }
}

const storage = new SafeStorage([bridgeBackend, localBackend, memoryBackend]);

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

const clamp01 = (value) => min(1, max(0, value));

const lerp = (a, b, t) => a + (b - a) * t;

const distance = (a, b) => hypot(a.x - b.x, a.y - b.y);

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
const STRING = { min: 180, base: 400, max: 470, reel: 240, payout: 70 };
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
  kite.tail = Array.from({ length: TAIL.segments + 1 }, (_, i) => {
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
    free: false,
    stuck: false,
  };
  hangTail(kite);
  return kite;
};

/** Holding RECOGER reels the line in; otherwise it pays out with the wind up to the current reach. */
const reelLine = (kite, reel, reach, dt) => {
  if (reel) kite.len = max(STRING.min, kite.len - STRING.reel * dt);
  else if (kite.len < reach) kite.len = min(reach, kite.len + STRING.payout * dt);
};

/** Direction of the wind's push: up (leaning to the centre) bent by the stick. */
const aeroDirection = (kite, { ax, ay }, lean) => {
  const [sx, sy] = unit(ax, ay);
  const inward = sign(W / 2 - kite.anchor.x);
  return unit(sin(lean) * inward * KITE.climb + sx, -cos(lean) * KITE.climb + sy);
};

/** A taut line turns the wind into a full push; a slack or cut kite catches only part of it. */
const accelerate = (kite, input, weather, dt) => {
  const [dx, dy] = aeroDirection(kite, input, weather.lean);
  const boost = kite.tug > 0 ? DASH.tugWind : kite.holding ? AIR.wind : 0;
  const wind = max(weather.wind, boost);
  const push = KITE.aero * wind * ((kite.taut || boost > 0) && !kite.free ? 1 : KITE.slackAero);
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

/** Holding B1 keeps the tug's lift on while AIRE lasts; released, the meter refills. */
const holdLift = (kite, hold, dt) => {
  kite.holding = hold && kite.air > 0;
  if (kite.holding) kite.air = max(0, kite.air - AIR.drain * dt);
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
  Object.assign(pin, tailPin(kite), { vx: kite.vx, vy: kite.vy });
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
  const control = kite.stun > 0 || kite.free ? IDLE_INPUT : input;
  if (!kite.free) reelLine(kite, control.reel, weather.reach, dt);
  const pulled = control.dash && canPull(kite);
  if (pulled) dash(kite, control);
  holdLift(kite, control.hold, dt);
  accelerate(kite, control, weather, dt);
  const damping = exp(-KITE.drag * dt);
  kite.vx *= damping;
  kite.vy *= damping;
  kite.x += kite.vx * dt;
  kite.y += kite.vy * dt;
  if (!kite.free) {
    keepOnScreen(kite);
    constrain(kite);
  }
  return pulled;
};

/** Advances one kite by dt and returns whether JALAR fired; a stuck kite (caught in the wires or on a roof)
 * only sways its tail. */
const stepKite = (kite, input, weather, dt) => {
  kite.tug = max(0, kite.tug - dt);
  kite.stun = max(0, kite.stun - dt);
  const pulled = !kite.stuck && flyKite(kite, input, weather, dt);
  stepTail(kite, weather, dt);
  return pulled;
};

/** Unit normal of a kite's string (anchor to kite). */
const stringNormal = (kite) => unit(kite.anchor.y - kite.y, kite.x - kite.anchor.x);

/** Speed of a blade point across a string; the string's own motion does not saw. */
const sweepSpeed = (point, rival) => {
  const [nx, ny] = stringNormal(rival);
  return abs(point.vx * nx + point.vy * ny);
};

/** Fastest speed at which the blade of `kite` saws across the string of `rival`; 0 when it is not sawing. */
const sawSpeed = (kite, rival) => {
  if (rival.free) return 0;
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
const ROUND = { countdown: 1.8, verdict: 1.2, slowmo: 0.3, ventarron: 20, wins: 3 };
// Wind strength swings through a slow cycle of gusts and calms; lead is how early the cue warns.
const WIND = { cycle: TAU / 10, flutter: 0.12, flutterRate: 1.7, gustRate: 0.45, lull: 0.55, rafaga: 1.45, lead: 1.5, opening: 0.3 };
// How deep the lulls swing (the duel's `lull`): gentle against the first rival, full against the last.
const LULLS = { ladder: [0.6, 0.66, 0.67, 0.68], versus: 0.64 };
const WEATHER = {
  calm: { wind: 1, lean: 1, gust: 1, reach: STRING.base },
  ventarron: { wind: 1.3, swing: 0.6, lean: 2, gust: 1.8, reach: STRING.max },
};

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

/** Weather at round time `at`: deterministic, so the screen can warn about what comes next. */
const weatherAt = (duel, at = duel.elapsed) => {
  const storm = at >= ROUND.ventarron ? WEATHER.ventarron : WEATHER.calm;
  const swing = storm.swing ?? duel.lull;
  const [cycle, flutter, side] = duel.windPhases;
  const wind = storm.wind + swing * sin(at * WIND.cycle + cycle) + WIND.flutter * sin(at * WIND.flutterRate + flutter);
  return {
    wind: max(0, wind),
    gust: KITE.gust * storm.gust * sin(at * WIND.gustRate + side),
    lean: KITE.lean * storm.lean,
    reach: storm.reach,
  };
};

/** 'calma' or 'rafaga' while one is on or due within the warning lead; null in steady wind. */
const windCue = (duel) => {
  const winds = [duel.elapsed, duel.elapsed + WIND.lead].map((at) => weatherAt(duel, at).wind);
  if (winds.some((wind) => wind < WIND.lull)) return 'calma';
  if (winds.some((wind) => wind > WIND.rafaga)) return 'rafaga';
  return null;
};

// The cycle starts just below steady and rising, so every round opens with a few seconds of normal wind.
const startRound = (duel) =>
  Object.assign(duel, {
    phase: 'countdown',
    clock: ROUND.countdown,
    elapsed: 0,
    ventarron: false,
    grace: 0,
    verdict: null,
    kites: [createKite(0), createKite(1)],
    zamuros: [],
    nextZamuro: between(duel.rng, ZAMURO.every),
    windPhases: [-duel.rng() * WIND.opening, duel.rng() * TAU, duel.rng() * TAU],
  });

const ladderLull = (level) => LULLS.ladder[level];

const createDuel = (rng, lull = LULLS.versus) => startRound({ rng, lull, score: [0, 0], round: 0, winner: null });

const spawnZamuros = (duel, dt) => {
  duel.nextZamuro -= dt;
  if (duel.nextZamuro > 0) return;
  const { rng } = duel;
  duel.nextZamuro = between(rng, ZAMURO.every);
  const direction = rng() < 0.5 ? 1 : -1;
  const x = direction > 0 ? -ZAMURO.margin : W + ZAMURO.margin;
  duel.zamuros.push({ x, y: between(rng, ZAMURO.band), vx: direction * ZAMURO.speed, hit: [false, false] });
};

/** A zamuro stuns each kite it touches once; returns the stun events. */
const stunKites = (duel) => {
  const events = [];
  for (const zamuro of duel.zamuros) {
    duel.kites.forEach((kite, player) => {
      if (zamuro.hit[player] || distance(zamuro, kite) > ZAMURO.radius + KITE.radius) return;
      zamuro.hit[player] = true;
      kite.stun = STUN;
      events.push({ type: 'stun', player });
    });
  }
  return events;
};

/** Moves kites and zamuros; returns a 'dash' event for every JALAR that fired. */
const advanceWorld = (duel, inputs, dt) => {
  const weather = weatherAt(duel);
  const events = [];
  duel.kites.forEach((kite, player) => {
    if (stepKite(kite, inputs[player], weather, dt)) events.push({ type: 'dash', player });
  });
  duel.zamuros.forEach((zamuro) => {
    zamuro.x += zamuro.vx * dt;
  });
  duel.zamuros = duel.zamuros.filter(({ x }) => x > -ZAMURO.margin - 1 && x < W + ZAMURO.margin + 1);
  return events;
};

/** Wears each string by the rival blade's travel across it, or lets it recover; returns which snapped. */
const frayStrings = (duel, dt) => {
  const { kites } = duel;
  const speeds = kites.map((kite, i) => (duel.grace > 0 ? 0 : sawSpeed(kite, kites[1 - i])));
  return kites.map((kite, i) => {
    const speed = speeds[1 - i];
    kite.fray = speed ? kite.fray + speed * dt : max(0, kite.fray - FRAY.recovery * dt);
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

const downKite = (kite, cause) => {
  kite.free = cause === 'cut';
  kite.stuck = !kite.free;
};

const award = (duel, loser, cause) => {
  const winner = loser === null ? null : 1 - loser;
  if (winner !== null) duel.score[winner] += 1;
  Object.assign(duel, { phase: 'verdict', clock: ROUND.verdict, verdict: { cause, loser, winner } });
  return { type: 'point', cause, loser, winner };
};

/** Checks cuts and crashes after a step; a double loss is a draw. */
const resolve = (duel, dt) => {
  const { kites } = duel;
  const snapped = frayStrings(duel, dt);
  if (snapped[0] && snapped[1]) return [clash(duel)];
  const causes = kites.map((kite, i) => (snapped[i] ? 'cut' : crashCause(kite)));
  const losers = [0, 1].filter((player) => causes[player]);
  if (!losers.length) return [];
  losers.forEach((player) => downKite(kites[player], causes[player]));
  const loser = losers.length === 1 ? losers[0] : null;
  return [award(duel, loser, loser === null ? 'draw' : causes[loser])];
};

const flyStep = (duel, inputs, dt) => {
  duel.elapsed += dt;
  duel.grace = max(0, duel.grace - dt);
  spawnZamuros(duel, dt);
  const events = [...advanceWorld(duel, inputs, dt), ...stunKites(duel)];
  if (!duel.ventarron && duel.elapsed >= ROUND.ventarron) {
    duel.ventarron = true;
    events.push({ type: 'ventarron' });
  }
  return [...events, ...resolve(duel, dt)];
};

const endRound = (duel) => {
  const winner = duel.score.findIndex((points) => points >= ROUND.wins);
  if (winner >= 0) {
    Object.assign(duel, { phase: 'over', winner });
    return [{ type: 'over', winner }];
  }
  duel.round += 1;
  startRound(duel);
  return [{ type: 'round' }];
};

const PHASES = {
  countdown(duel, inputs, dt) {
    duel.clock -= dt;
    if (duel.clock > 0) return [];
    duel.phase = 'fly';
    return [{ type: 'go' }];
  },
  fly: flyStep,
  /** The world keeps moving in slow motion while the verdict is shown. */
  verdict(duel, inputs, dt) {
    const events = advanceWorld(duel, inputs, dt * ROUND.slowmo);
    duel.clock -= dt;
    return duel.clock > 0 ? events : [...events, ...endRound(duel)];
  },
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
// past the rival string each saw stroke reaches); pace (share of frames it pushes the stick outside a climb).
const RIVAL_STATS = ['reaction', 'aim', 'dashRange', 'guard', 'nerve', 'foresight', 'aggression', 'stroke', 'pace'];
const rival = (name, barrio, motto, stats) => ({ name, barrio, motto, ...Object.fromEntries(RIVAL_STATS.map((key, i) => [key, stats[i]])) });
const RIVALS = [
  // A careful beginner: climbs out of calms in time, but dawdles and hovers instead of sawing.
  rival('EL CHAMO', 'Catia', 'Apenas está aprendiendo', [0.75, 100, 0, 0, 390, 0.7, 0.6, 0, 0.6]),
  rival('LA FLACA', 'Petare', 'Rápida y mañosa', [0.47, 56, 70, 0.3, 420, 0.27, 0.8, 50, 1]),
  rival('EL CATIRE', 'La Pastora', 'Nunca suelta el hilo', [0.18, 16, 90, 0.45, 400, 0.2, 1, 75, 1]),
  rival('DON GOYO', 'El Valle', 'Cuarenta años cortando papagayos', [0.12, 10, 110, 0.75, 380, 0, 1, 70, 1]),
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

/** Re-plans after its reaction time: climb out of a calm, retreat when threatened, or saw. */
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
    Object.assign(cpu, { target: { x: me.x, y: 0 }, reel: false, dash: true });
    return;
  }
  cpu.reel = threatened(me, rival) && rng() < spec.guard;
  const attacks = !cpu.reel && rng() < spec.aggression;
  const aim = attacks ? sawPoint(me, rival, spec.stroke) : retreatPoint(me);
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

// Solo points: a cut is worth more than a rival's crash; a quick point earns `quick` per second
// under `quickWithin`; beating rival n pays `win` × n, plus `flawless` for a 3-0.
const SCORE = { cut: 1000, crash: 400, quick: 25, quickWithin: 20, win: 2000, flawless: 1500 };

const createStats = () => [0, 1].map(() => ({ cuts: 0, crashes: 0, dashes: 0 }));

/** Adds one duel event to the per-player CORTES / CHOQUES / JALONES counters. */
const tally = (stats, { type, cause, winner, loser, player }) => {
  if (type === 'dash') stats[player].dashes += 1;
  if (type !== 'point' || winner === null) return;
  if (cause === 'cut') stats[winner].cuts += 1;
  else stats[loser].crashes += 1;
};

/** Points the human (player 0) earns for a point won after `seconds` of flying. */
const pointScore = ({ cause, winner }, seconds) => {
  if (winner !== 0) return 0;
  const quick = round(max(0, SCORE.quickWithin - seconds) * SCORE.quick);
  return (cause === 'cut' ? SCORE.cut : SCORE.crash) + quick;
};

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
// Bodies: 0 chamo, 1 chama, 2 señor (rival only). Hair styles are indices into HAIR_PAINTERS; the first
// four belong to chamos, the next four to chamas, and the last two are rival-only.
const BODY_NAMES = ['CHAMO', 'CHAMA'];
const HAIR_NAMES = ['CORTO', 'GORRA', 'RIZOS', 'CRESTA', 'COLA', 'MOÑO', 'TRENZAS', 'MELENA'];
const HAIRS_BY_BODY = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
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
  { body: 1, hair: 4, skin: 2, shirt: 1, kite: 1 },
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

// The four barrio rivals, by ladder level: a boy, a slim girl, a blond teenager and an old master.
const RIVAL_LOOKS = [
  look(0, 1, SKINS[2], 0x2fbf71, HAIR_TONES.dark, 0.96, kiteOf(0x2fbf71, ['001001', 0xffffff])),
  look(1, 4, SKINS[1], 0xff7ab6, HAIR_TONES.dark, 1, kiteOf(0xff7ab6, ['011011', 0x7a3fb5])),
  look(0, 8, SKINS[0], 0x2f6fd6, HAIR_TONES.blond, 1.1, kiteOf(0x2f6fd6, ['000111', 0xffffff])),
  look(2, 9, SKINS[2], 0xf2ead8, HAIR_TONES.white, 1.16, kiteOf(0xff8a1f, ['010101', 0x1c1c1c])),
];

/** Who stands on each azotea: the human player(s) as customised, and in solo the rival of that level. */
const looksFor = (mode, level, choices) => [
  resolveLook(choices[0], 0),
  mode === 'solo' ? RIVAL_LOOKS[level] : resolveLook(choices[1], 1),
];

// ---------------------------------------------------------------------------
// 10. Art direction (pure)
// ---------------------------------------------------------------------------

const SILHOUETTE = 0x24152b;
const RIM = 0xffa25e;
const STICK = 0x4a2c18;
const STEEL = 0xe8eef7;
const WIRE = 0x150c13;
const HAZE = 0x7a3a5a;
const ZAMURO_INK = 0x17111a;
const ZAMURO_TIP = 0xcfc6bd;
const WINDOW_COLORS = [0xffd27a, 0xffe6a8, 0xfff2d6, 0x9fd0ff];
const RANCHOS = [0xc0603e, 0xd27d4e, 0xe0a273, 0xa65f80, 0xe6b98d, 0x86609a, 0xd9c27a];
// Faded street paper, never as saturated as the tail bows.
const PAPELITOS = [0xc79a8c, 0x93a7b3, 0xd3c29a, 0xae96ab];

// Sky stops (top to horizon) for golden hour, dusk and the first night: the match walks through them.
const SKIES = [
  [0x2b1640, 0x7a2f5b, 0xe2683c, 0xffb347],
  [0x1c1238, 0x4a1f5c, 0xa63a55, 0xef7b45],
  [0x060a1d, 0x111a3c, 0x2b2453, 0x683453],
];
// Night falls on the fifth round; ease is how fast the light follows a new round (1/s).
const DAY = { rounds: 4, ease: 0.7 };
const NIGHT_TINT = 0x5a5f9a;
const CLOUD_NIGHT = 0x6a72a6;
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

/** Time of day of a round: 0 is golden hour, 1 the first night. */
const dayPhase = (round) => min(1, round / DAY.rounds);

/** Opacity of each baked sky, stacked in order so they crossfade golden → dusk → night. */
const skyAlphas = (t) => SKIES.map((_, i) => clamp01(t * (SKIES.length - 1) - i + 1));

/** City windows switch on in waves as night falls. */
const lightsAlpha = (t, wave) => clamp01((t - 0.3 - wave * 0.18) / 0.2);

/** How the wind looks (px/s) on papelitos, clothes, clouds and the flag. */
const windDrift = ({ wind, gust }) => ({ vx: wind * (BREEZE.speed + gust * BREEZE.gust), vy: BREEZE.sink * (1 - wind) });

/** Belly of a string at its middle (px): nearly straight when taut, loose when slack. */
const stringSag = (kite) =>
  kite.taut ? SAG.taut : min(SAG.max, SAG.taut + (kite.len - distance(kite, kite.anchor)) * SAG.slack);

/** Points of a curve from a to b whose middle hangs `sag` px down. */
const sagCurve = (a, b, sag, count = 12) =>
  Array.from({ length: count + 1 }, (_, i) => {
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

/** Who is celebrating after a point: 'win', 'lose' or null. */
const moodOf = (verdict, player) => {
  if (!verdict || verdict.winner === null) return null;
  return verdict.winner === player ? 'win' : 'lose';
};

// ---------------------------------------------------------------------------
// 11. Painters (procedural, baked once into canvas textures)
// ---------------------------------------------------------------------------

// Background layers are wider than the screen so they can slide for parallax.
const PARALLAX = 40;
const WIDE = W + 2 * PARALLAX;
const SUN = { x: 150, rise: 240, set: 450, size: 320 };
// El Ávila is a long, flat-topped massif: far crest, main crest with the hotel, then the foothills.
const RIDGES = [
  { top: 0x9c6d96, haze: 0xe79a7e, base: 400, peak: 200, centre: 560, spread: 360, rough: 1.2, depth: 0.02 },
  { top: 0x5a3b78, haze: 0xb0566c, base: 450, peak: 238, centre: 380, spread: 320, rough: 1.5, depth: 0.04, hotel: true },
  { top: 0x2f2147, haze: 0x6e3858, base: 482, peak: 372, centre: 600, spread: 300, rough: 1.8, depth: 0.06 },
];
const CLOUDS = [
  { y: 0, height: 230, depth: 0.1, count: 5, top: 50, bottom: 140, size: 220, alpha: 0.42, flat: 1 },
  { y: 180, height: 120, depth: 0.25, count: 5, top: 45, bottom: 75, size: 200, alpha: 0.32, flat: 0.45 },
];
const CITY_DEPTH = 0.09;
const TOWERS = [314, 350];
const TOWER_TOP = 300;
const BARRIO = { reach: 330, rise: 150, foot: 480, ranchos: 170 };
// Window panes [width, height, gap x, gap y, ink alpha, chance to light up] for far and near buildings.
const PANE_FAR = [2, 2, 5, 6, 0.3, 0.3];
const PANE_NEAR = [6, 7, 12, 14, 0.55, 0.22];
const LIGHT_WAVES = 3;
const POLE = { top: 446, bar: 54 };
const CABLES = [-7, 0, 7];
// Azoteas seen slightly from above: the kid stands on the front edge of a deck whose back edge is ROOF_Y.
const DECK = 572;
const AZOTEA = { half: 80 };
// Per-player rooftop clutter, x offsets from the anchor (tank, antenna or dish).
const ROOFTOPS = [
  { tank: -48, antenna: -66, wall: 0x3b2234 },
  { tank: 62, dish: 30, wall: 0x452a3a },
];
const SPRITES = { glow: 128, spark: 16 };

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

const rgba = (color, alpha = 1) => `rgba(${color >> 16},${(color >> 8) & 255},${color & 255},${alpha})`;

/** Linear gradient through evenly spaced [color, alpha] stops. */
const linear = (ctx, x0, y0, x1, y1, stops) => {
  const fill = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([color, alpha = 1], i) => fill.addColorStop(i / (stops.length - 1), rgba(color, alpha)));
  return fill;
};

/** Radial gradient through [color, alpha, offset] stops. */
const radial = (ctx, x, y, radius, stops) => {
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
  stops.forEach(([color, alpha, at]) => fill.addColorStop(at, rgba(color, alpha)));
  return fill;
};

/** Fills a rectangle with a colour or gradient. */
const box = (ctx, fill, x, y, w, h) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
};

const tracePath = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
};

const paintSky = (stops, stars) => (ctx, rng) => {
  box(ctx, linear(ctx, 0, 0, 0, 470, stops.map((color) => [color])), 0, 0, W, H);
  for (let i = 0; i < stars; i += 1) {
    box(ctx, rgba(0xffffff, 0.2 + rng() * 0.7), rng() * W, rng() * 320, 1.5, 1.5);
  }
};

const paintSun = (ctx) => {
  const r = SUN.size / 2;
  box(ctx, radial(ctx, r, r, r, [
    [0xfffbe8, 1, 0],
    [0xffe6a0, 1, 0.1],
    [0xffb050, 0.45, 0.17],
    [0xff7a40, 0.15, 0.45],
    [0xff5a30, 0, 1],
  ]), 0, 0, SUN.size, SUN.size);
};

/** Soft cloud clusters, pink on top and lit orange underneath; drawn three times so the layer tiles. */
const paintClouds = ({ count, top, bottom, size, alpha, flat }) => (ctx, rng) => {
  ctx.filter = 'blur(2px)';
  for (let i = 0; i < count; i += 1) {
    const cx = rng() * W;
    const cy = between(rng, [top, bottom]);
    const width = size * (0.6 + rng());
    // Puffs grow toward the middle and sit on a flat base, so each cluster reads as a cumulus.
    const puffs = Array.from({ length: 9 }, () => {
      const off = rng() - 0.5;
      const r = width * (0.08 + rng() * 0.06) * (1.6 - abs(off) * 2);
      return [cx + off * width, cy - r * 0.6 * flat, r];
    });
    for (const shift of [-W, 0, W]) {
      puffs.forEach(([x, y, r]) => {
        ctx.fillStyle = linear(ctx, 0, y - r, 0, y + r, [[0xff9cb4, alpha * 0.5], [0xffb36b, alpha]]);
        ctx.beginPath();
        ctx.ellipse(x + shift, y, r * 1.7, r * flat, 0, 0, TAU);
        ctx.fill();
      });
    }
  }
};

/** The Hotel Humboldt: a round tower with a crown and a mast on the summit of El Ávila. */
const paintHumboldt = (ctx, [x, y], color) => {
  box(ctx, rgba(mixColor(color, INK, 0.35)), x - 6, y - 26, 12, 28);
  ctx.fillRect(x - 8, y - 31, 16, 6);
  ctx.fillRect(x - 0.5, y - 44, 1, 14);
};

/** One ridge of El Ávila: a flat-topped massif roughened by midpoint displacement, hazier at its foot. */
const paintRidge = ({ top, haze, base, peak, centre, spread, rough, hotel }) => (ctx, rng) => {
  const offsets = ridgeLine(rng, 64, rough);
  const crest = offsets.map((offset, i) => {
    const x = (i / 64) * WIDE;
    return [x, base - (base - peak) / (1 + ((x - centre) / spread) ** 4) + offset];
  });
  ctx.fillStyle = linear(ctx, 0, peak, 0, base, [[top], [mixColor(top, haze, 0.45)], [haze]]);
  tracePath(ctx, [...crest, [WIDE, H], [0, H]]);
  ctx.fill();
  ctx.strokeStyle = rgba(RIM, 0.35);
  ctx.lineWidth = 1.5;
  tracePath(ctx, crest);
  ctx.stroke();
  if (hotel) paintHumboldt(ctx, crest.reduce((high, point) => (point[1] < high[1] ? point : high)), top);
};

/** A block with a sunset rim on its roof edge and a grid of panes; some panes will light up at night. */
const paintBuilding = (ctx, rng, windows, x, y, width, color, [paneW, paneH, gapX, gapY, ink, lit] = PANE_NEAR) => {
  box(ctx, rgba(color), x, y, width, H - y);
  box(ctx, rgba(RIM, 0.5), x, y, width, 1.5);
  ctx.fillStyle = rgba(INK, ink);
  for (let py = y + gapY * 0.7; py < H - paneH; py += gapY) {
    for (let px = x + gapX / 2; px < x + width - paneW; px += gapX) {
      ctx.fillRect(px, py, paneW, paneH);
      if (rng() < lit) windows.push({ x: px, y: py, w: paneW, h: paneH });
    }
  }
};

/** Ranchos climbing a hillside on one edge of the valley; higher ones fade into the haze. */
const paintBarrio = (ctx, rng, windows, side) => {
  const edge = side ? WIDE : 0;
  const inward = side ? -1 : 1;
  const hill = (x) => BARRIO.foot - BARRIO.rise * max(0, 1 - abs(x - edge) / BARRIO.reach) ** 1.4;
  const ground = Array.from({ length: 35 }, (_, i) => edge + inward * i * 10);
  ctx.fillStyle = rgba(0x3a2240);
  tracePath(ctx, [...ground.map((x) => [x, hill(x) - 4]), [ground[34], H], [edge, H]]);
  ctx.fill();
  const ranchos = Array.from({ length: BARRIO.ranchos }, () => {
    const x = edge + inward * rng() * BARRIO.reach * 0.95;
    const color = RANCHOS[floor(rng() * RANCHOS.length)];
    return { x, y: between(rng, [hill(x), BARRIO.foot]), w: 9 + rng() * 9, h: 7 + rng() * 6, color, lit: rng() < 0.6 };
  }).sort((a, b) => a.y - b.y);
  ranchos.forEach(({ x, y, w, h, color, lit }) => {
    const shade = mixColor(color, HAZE, 0.25 + 0.4 * clamp01((BARRIO.foot - y) / BARRIO.rise));
    box(ctx, rgba(shade), x, y - h, w, h);
    box(ctx, rgba(mixColor(shade, INK, 0.45)), x - 1, y - h - 2, w + 2, 2);
    const pane = { x: x + w * 0.3, y: y - h * 0.65, w: 2, h: 2 };
    ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
    if (lit) windows.push(pane);
  });
};

/** Mid-distance skyline with the twin Parque Central towers, framed by the barrios. */
const paintCity = (windows) => (ctx, rng) => {
  for (let x = 170; x < 720; x += 18 + rng() * 18) {
    paintBuilding(ctx, rng, windows, x, 405 + rng() * 45, 16 + rng() * 14, mixColor(0x2a1d3e, HAZE, 0.25), PANE_FAR);
  }
  const tower = mixColor(0x261a3a, HAZE, 0.3);
  TOWERS.forEach((x) => {
    paintBuilding(ctx, rng, windows, x, TOWER_TOP, 24, tower, PANE_FAR);
    box(ctx, rgba(tower), x + 4, TOWER_TOP - 9, 16, 10);
    ctx.fillRect(x + 11, TOWER_TOP - 26, 2, 18);
    box(ctx, rgba(INK, 0.35), x + 11, TOWER_TOP, 2, H);
  });
  [0, 1].forEach((side) => paintBarrio(ctx, rng, windows, side));
};

/** Glowing panes for one wave of windows (every `waves`-th pane), blended additively at night. */
const paintLights = (windows, wave, waves = LIGHT_WAVES) => (ctx) => {
  ctx.shadowBlur = 8;
  windows.forEach((pane, i) => {
    if (i % waves !== wave) return;
    ctx.fillStyle = ctx.shadowColor = rgba(WINDOW_COLORS[i % WINDOW_COLORS.length]);
    ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  });
};

const cablePath = (offset) =>
  Array.from({ length: 23 }, (_, i) => {
    const x = lerp(POWER_LINE.from, POWER_LINE.to, i / 22);
    return [x, powerLineY(x) + offset];
  });

/** Wooden poles with crossbars and insulators, three sagging cables catching the sunset. */
const paintWires = (ctx) => {
  [POWER_LINE.from, POWER_LINE.to].forEach((x) => {
    box(ctx, rgba(WIRE), x - 4, POLE.top, 8, H);
    ctx.fillRect(x - POLE.bar / 2, POLE.top + 6, POLE.bar, 5);
    ctx.fillStyle = rgba(0x9a8f9a);
    CABLES.forEach((offset) => ctx.fillRect(x - 2, powerLineY(x) + offset - 5, 4, 6));
  });
  box(ctx, rgba(WIRE), POWER_LINE.from - 18, POLE.top + 26, 13, 20);
  CABLES.forEach((offset) => {
    ctx.strokeStyle = rgba(WIRE);
    ctx.lineWidth = 2;
    tracePath(ctx, cablePath(offset));
    ctx.stroke();
    ctx.strokeStyle = linear(ctx, POWER_LINE.from, 0, POWER_LINE.to, 0, [[RIM, 0], [0xffe0b0, 0.6], [RIM, 0]]);
    ctx.lineWidth = 1;
    tracePath(ctx, cablePath(offset - 1));
    ctx.stroke();
  });
};

/** A blue water tank on legs, as on every Caracas rooftop. */
const paintTank = (ctx, x) => {
  box(ctx, rgba(SILHOUETTE), x - 11, ROOF_Y - 14, 3, 14);
  ctx.fillRect(x + 8, ROOF_Y - 14, 3, 14);
  box(ctx, linear(ctx, x - 14, 0, x + 14, 0, [[0x1d3d6e], [0x3d79c0], [0x1d3d6e]]), x - 14, ROOF_Y - 38, 28, 26);
  box(ctx, rgba(RIM, 0.7), x - 14, ROOF_Y - 40, 28, 3);
};

const paintDish = (ctx, x) => {
  box(ctx, rgba(SILHOUETTE), x - 1, ROOF_Y - 26, 2, 26);
  ctx.beginPath();
  ctx.ellipse(x, ROOF_Y - 32, 11, 7, -0.6, 0, TAU);
  ctx.fill();
  box(ctx, rgba(RIM, 0.6), x - 8, ROOF_Y - 40, 3, 3);
};

const paintAntenna = (ctx, x) => {
  box(ctx, rgba(SILHOUETTE), x - 1, ROOF_Y - 58, 2, 58);
  [0, 9, 18].forEach((dy, i) => ctx.fillRect(x - 12 + i * 2, ROOF_Y - 56 + dy, 24 - i * 4, 2));
};

/** The two flyers' azoteas, street blocks under the cables and frame blocks at the screen edges. */
const paintAzoteas = (windows) => (ctx, rng) => {
  for (let x = POWER_LINE.from; x < POWER_LINE.to - 30; x += 50 + rng() * 10) {
    paintBuilding(ctx, rng, windows, x, 548 + rng() * 26, 46, 0x2e1c32);
  }
  paintBuilding(ctx, rng, windows, -10, 452, 72, 0x2b1a30);
  paintBuilding(ctx, rng, windows, W - 64, 462, 74, 0x2b1a30);
  ANCHORS.forEach(({ x }, player) => {
    const { tank, antenna, dish, wall } = ROOFTOPS[player];
    const left = x - AZOTEA.half - 4;
    const width = AZOTEA.half * 2 + 8;
    paintBuilding(ctx, rng, windows, left + 4, DECK, width - 8, wall);
    box(ctx, linear(ctx, 0, ROOF_Y, 0, DECK, [[mixColor(wall, RIM, 0.25)], [mixColor(wall, INK, 0.2)]]), left, ROOF_Y - 4, width, DECK - ROOF_Y + 4);
    box(ctx, rgba(RIM, 0.8), left, ROOF_Y - 6, width, 2);
    ctx.fillRect(left, DECK - 2, width, 2);
    paintTank(ctx, x + tank);
    if (antenna) paintAntenna(ctx, x + antenna);
    if (dish) paintDish(ctx, x + dish);
  });
};

/** Soft white dot; tinted and blended additively it becomes a glow or a spark. */
const paintDot = (size) => (ctx) => {
  const r = size / 2;
  box(ctx, radial(ctx, r, r, r, [
    [0xffffff, 1, 0],
    [0xffffff, 0.35, 0.35],
    [0xffffff, 0, 1],
  ]), 0, 0, size, size);
};

// ---------------------------------------------------------------------------
// 12. Backdrop (parallax layers)
// ---------------------------------------------------------------------------

/** Sky, sun, clouds, El Ávila, city and wires; the light follows the time of day. */
class Backdrop {
  constructor(scene) {
    const image = (key) => scene.add.image(0, 0, key).setOrigin(0);
    const layer = (key, depth) => {
      const added = image(key);
      this.parallax.push({ image: added, depth });
      return added;
    };
    this.parallax = [];
    this.clouds = [];
    this.skies = SKIES.map((stops, i) => image(bake(scene, `sky-${i}`, W, H, paintSky(stops, i * 80))));
    this.sun = scene.add.image(SUN.x, SUN.rise, bake(scene, 'sun', SUN.size, SUN.size, paintSun)).setBlendMode('ADD');
    this.addClouds(scene, 0);
    const ridge = (i) => layer(bake(scene, `ridge-${i}`, WIDE, H, paintRidge(RIDGES[i])), RIDGES[i].depth);
    this.tinted = [ridge(0), ridge(1)];
    this.addClouds(scene, 1);
    const windows = [];
    this.tinted.push(ridge(2), layer(bake(scene, 'city', WIDE, H, paintCity(windows)), CITY_DEPTH));
    this.glowingWindows = Array.from({ length: LIGHT_WAVES }, (_, wave) =>
      layer(bake(scene, `lights-${wave}`, WIDE, H, paintLights(windows, wave)), CITY_DEPTH).setBlendMode('ADD'),
    );
    this.tinted.push(image(bake(scene, 'wires', W, H, paintWires)));
  }

  addClouds(scene, i) {
    const spec = CLOUDS[i];
    const key = bake(scene, `clouds-${i}`, W, spec.height, paintClouds(spec));
    this.clouds.push({ sprite: scene.add.tileSprite(0, spec.y, W, spec.height, key).setOrigin(0), depth: spec.depth });
  }

  /** The azoteas in front of the action (added after whatever must sit behind them). */
  addForeground(scene) {
    const windows = [];
    const add = (key) => scene.add.image(0, 0, key).setOrigin(0);
    this.tinted.push(add(bake(scene, 'azoteas', W, H, paintAzoteas(windows))));
    this.glowingWindows.push(add(bake(scene, 'azotea-lights', W, H, paintLights(windows, 0, 1))).setBlendMode('ADD'));
  }

  update(day, drift, dt, focusX) {
    const sunset = clamp01(day / 0.7);
    const sunY = lerp(SUN.rise, SUN.set, sunset);
    skyAlphas(day).forEach((alpha, i) => this.skies[i].setAlpha(alpha));
    this.sun.setY(sunY).setAlpha(1 - sunset * 0.5);
    const tint = mixColor(0xffffff, NIGHT_TINT, day);
    this.tinted.forEach((image) => image.setTint(tint));
    this.glowingWindows.forEach((image, wave) => image.setAlpha(lightsAlpha(day, wave)));
    this.clouds.forEach(({ sprite, depth }) => {
      sprite.tilePositionX -= drift.vx * depth * dt;
      sprite.setTint(mixColor(0xffffff, CLOUD_NIGHT, day)).setAlpha(1 - day * 0.45);
    });
    this.parallax.forEach(({ image, depth }) => image.setX(-PARALLAX + (W / 2 - focusX) * depth));
  }
}

// ---------------------------------------------------------------------------
// 13. Actors: wind, zamuros, kids, kites
// ---------------------------------------------------------------------------

// Particles turn into streaks exactly when the wind reaches the ¡RÁFAGA! threshold.
const WIND_PARTICLES = { count: 70, top: 20, bottom: 520, streak: BREEZE.speed * WIND.rafaga, trace: 0.06 };
const PAPELITO = [[-3, -2], [3, -2], [3, 2], [-3, 2]];

/** Papelitos, leaves and dust that make the wind visible: they streak in gusts and flutter down in calms. */
class WindParticles {
  constructor() {
    const rng = makeRng(7);
    this.items = Array.from({ length: WIND_PARTICLES.count }, () => ({
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
        g.lineStyle(1.5, CREAM, 0.5).lineBetween(x, y, x - drift.vx * trace, y - drift.vy * trace);
      } else if (dust) {
        g.fillStyle(RIM, 0.5).fillCircle(x, y, 1.3);
      } else {
        g.fillStyle(color, 0.6).fillPoints(posed(PAPELITO, x, y, spin, pace), true);
      }
    });
  }
}

// Perches along the top cable; a perched zamuro takes off whenever a new one crosses the sky.
const PERCHES = [262, 304, 468, 512, 552];
const TAKEOFF = { vx: 90, vy: -120, climb: 30 };

/** Black vulture in flight: wings flap around the body, with pale primaries at the tips. */
const drawVulture = (g, x, y, flap, scale) => {
  const span = 22 * scale;
  const tipY = y + flap * 10 * scale;
  g.fillStyle(ZAMURO_INK);
  [-1, 1].forEach((side) => {
    g.fillTriangle(x, y - 3 * scale, x + side * span, tipY, x + side * 5 * scale, y + 4 * scale);
    g.fillStyle(ZAMURO_TIP, 0.8).fillTriangle(x + side * span, tipY, x + side * (span - 6 * scale), tipY - 2 * scale, x + side * (span - 5 * scale), tipY + 3 * scale);
    g.fillStyle(ZAMURO_INK);
  });
  g.fillEllipse(x, y + scale, 16 * scale, 8 * scale);
};

/** Zamuros perched on the top cable; one takes off whenever a new zamuro crosses the sky, all on a chispazo. */
class Birds {
  constructor() {
    this.reset();
  }

  reset() {
    this.flock = PERCHES.map((x) => ({ x, y: powerLineY(x) + CABLES[0] - 7, vx: 0, vy: 0 }));
    this.seen = 0;
  }

  launch(bird, direction) {
    if (bird && !bird.vx) Object.assign(bird, { vx: direction * TAKEOFF.vx, vy: TAKEOFF.vy });
  }

  scatter() {
    this.flock.forEach((bird) => this.launch(bird, sign(bird.x - W / 2)));
  }

  update(zamuros, dt) {
    if (zamuros.length > this.seen) this.launch(this.flock.find((bird) => !bird.vx), -sign(zamuros[zamuros.length - 1].vx));
    this.seen = zamuros.length;
    this.flock.forEach((bird) => {
      bird.vy += bird.vx && TAKEOFF.climb * dt;
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
    });
  }

  draw(g, clock) {
    this.flock.forEach(({ x, y, vx }, i) => {
      if (vx) drawVulture(g, x, y, sin(clock * 14 + i), 0.7);
      else g.fillStyle(ZAMURO_INK).fillEllipse(x, y, 9, 13).fillStyle(0x6b5f60).fillCircle(x + (i % 2 ? 3 : -3), y - 7 + sin(clock * 2 + i), 2.5);
    });
  }
}

/** The kids on both azoteas. */
const drawRooftops = (g, flyers) => flyers.forEach((flyer, player) => drawAvatar(g, flyer.look, flyer.stance(ANCHORS[player])));

// The kid stands on the front edge of the deck; the string hand rests exactly on the physics anchor.
const KID = { foot: DECK - 2, back: 14, jump: 16, slump: 6, carrete: 10 };
// Figure proportions in local units: feet at y 0 and up is negative; looks and poses scale and flip it.
const FIGURE = { hip: -28, shoulder: -58, head: -73, headR: 10, hunch: 5 };
const FACE = { ink: 0x2a1810, white: 0xffffff, blush: 0xff7a8a, tear: 0x8fd3ff };
const PANTS = 0x2c3550;
const HEADGEAR = { cap: 0xd8323c, band: 0xe8432e, hat: 0x8a6a3a, hatBand: 0x3b2414 };
const TRAIL = { time: 0.3, points: 14, width: 14 };
const SPIN_RATE = 18;
const YANK_DECAY = 4;
const REEL_SPIN = 18;

/** Per-player art state: the kid's look and animation, the dash trail and the cut kite's tumble. */
class Flyer {
  constructor(player, look) {
    this.player = player;
    this.look = look;
    this.side = player === 0 ? 1 : -1;
    this.clock = 0;
    this.reset();
  }

  reset() {
    Object.assign(this, { len: 0, fray: 0, yank: 0, holding: false, reeling: false, turn: 0, lift: 0, mood: null, trail: [], trailTime: 0, fall: null });
  }

  dash() {
    this.yank = 1;
    this.trailTime = TRAIL.time;
  }

  /** The kid's own animation: jumping after winning a point, slumping after losing one. */
  pose(mood, dt) {
    this.clock += dt;
    this.mood = mood;
    this.lift = mood === 'win' ? abs(sin(this.clock * 9)) * KID.jump : 0;
  }

  /** Follows the kite since the last frame; returns whether its string was sawn meanwhile. */
  update(kite, mood, dt) {
    this.pose(mood, dt);
    const frayed = kite.fray > this.fray + 0.5;
    this.reeling = kite.len < this.len - 0.1;
    Object.assign(this, { len: kite.len, fray: kite.fray, holding: kite.holding });
    this.yank = kite.holding ? 1 : max(0, this.yank - dt * YANK_DECAY);
    this.turn += this.reeling ? dt * REEL_SPIN : 0;
    this.trailTime = max(0, this.trailTime - dt);
    if (this.trailTime > 0) this.trail.unshift({ x: kite.x, y: kite.y });
    if (this.trailTime === 0 || this.trail.length > TRAIL.points) this.trail.pop();
    return frayed;
  }

  /** The string hand: on the anchor at rest, yanked back and up on JALAR. */
  hand({ anchor }) {
    return { x: anchor.x - this.side * this.yank * 12, y: anchor.y - this.yank * 7 - this.lift };
  }

  /** Where and how the kid stands on its azotea. */
  stance(anchor) {
    const { side, mood, lift, yank, turn, clock } = this;
    const expression = mood || (this.holding || yank > 0.5 ? 'effort' : 'focus');
    return { x: anchor.x - side * KID.back, y: KID.foot, scale: 1, side, mood, expression, lift, yank, turn, clock, hand: this.hand({ anchor }) };
  }
}

/** The kite reel (carrete): a wooden spool whose spoke spins while reeling in. */
const drawCarrete = (g, x, y, turn) => {
  g.fillStyle(0x8a5a2b).fillCircle(x, y, 7);
  g.lineStyle(2, INK).strokeCircle(x, y, 7).lineBetween(x, y, x + cos(turn) * 6, y + sin(turn) * 6);
};

/** Cap of hair over the top of the head, shared by most styles. */
const hairCap = (g, { x, y }, tone) => g.fillStyle(tone).fillEllipse(x, y - 5, 22, 12);

// One painter per hair style (indices as in HAIRS_BY_BODY), drawn over the head: (g, head, side, tone, clock).
const HAIR_PAINTERS = [
  (g, h, s, tone) => hairCap(g, h, tone).fillRect(h.x - s * 10 - 1.5, h.y - 6, 3, 7),
  (g, h, s) => {
    g.fillStyle(HEADGEAR.cap).fillEllipse(h.x, h.y - 5, 23, 13);
    g.fillRect(min(h.x - s * 8, h.x - s * 18), h.y - 7, 10, 3);
  },
  (g, h, s, tone) => [-8, -4, 0, 4, 8, -5, 2].forEach((ox, i) => g.fillStyle(tone).fillCircle(h.x + ox, h.y - (i < 5 ? 6 : 11), 5)),
  (g, h, s, tone) => hairCap(g, h, mixColor(tone, 0x888888, 0.4)).fillStyle(tone).fillEllipse(h.x - s, h.y - 12, 7, 16),
  (g, h, s, tone, clock) => {
    hairCap(g, h, tone).fillEllipse(h.x - s * 13, h.y + 1 + sin(clock * 4) * 2, 8, 17);
    g.fillStyle(HEADGEAR.band).fillCircle(h.x - s * 10, h.y - 5, 2.5);
  },
  (g, h, s, tone) => hairCap(g, h, tone).fillCircle(h.x - s * 2, h.y - 13, 6),
  (g, h, s, tone) => [-1, 1].forEach((k) => hairCap(g, h, tone).fillEllipse(h.x + k * 10, h.y + 7, 5, 15)),
  (g, h, s, tone) => hairCap(g, h, tone).fillRoundedRect(min(h.x - s * 3, h.x - s * 13), h.y - 6, 10, 22, 4),
  (g, h, s, tone) => {
    [-7, -2, 3, 8].forEach((ox) => g.fillStyle(tone).fillTriangle(h.x + ox - 4, h.y - 6, h.x + ox + 4, h.y - 6, h.x + ox - s * 2, h.y - 15));
    hairCap(g, h, tone).fillStyle(HEADGEAR.band).fillRect(h.x - 10, h.y - 7, 20, 3);
  },
  (g, h, s, tone) => {
    g.fillStyle(tone).fillEllipse(h.x - s * 8, h.y + 1, 6, 9);
    g.fillStyle(HEADGEAR.hat).fillRoundedRect(h.x - 8, h.y - 19, 16, 11, 4).fillEllipse(h.x, h.y - 8, 34, 7);
    g.fillStyle(HEADGEAR.hatBand).fillRect(h.x - 8, h.y - 11, 16, 2);
  },
];

/** Face toward the kite: eyes, brows and mouth for the mood (focus, effort, win, lose). */
const drawFace = (g, { x, y }, side, expression, old) => {
  const ex = x + side * 2;
  const eyes = [ex - 3.5, ex + 3.5];
  const brow = { focus: 1, effort: 2, win: -1, lose: -2 }[expression];
  g.lineStyle(1.4, FACE.ink);
  eyes.forEach((eye, i) => g.lineBetween(eye - 2, y - 5 + (i ? brow : -brow) * 0.6, eye + 2, y - 5 - (i ? brow : -brow) * 0.6));
  g.fillStyle(FACE.ink);
  if (expression === 'effort') eyes.forEach((eye) => g.fillRect(eye - 2, y - 1.5, 4, 1.4));
  else if (expression === 'win') eyes.forEach((eye) => g.lineBetween(eye - 1.8, y - 0.5, eye, y - 2.2).lineBetween(eye, y - 2.2, eye + 1.8, y - 0.5));
  else eyes.forEach((eye) => g.fillCircle(eye, y - 1, 1.5));
  if (expression === 'win') {
    g.beginPath().arc(ex, y + 3, 4, 0, PI).fillPath();
    g.fillStyle(FACE.white).fillRect(ex - 3, y + 3, 6, 1.2);
    g.fillStyle(FACE.blush, 0.5).fillCircle(ex - 6, y + 2, 2).fillCircle(ex + 6, y + 2, 2);
  } else if (expression === 'effort') {
    g.fillRect(ex - 3, y + 3, 6, 3.5);
    g.fillStyle(FACE.white).fillRect(ex - 2.5, y + 3.8, 5, 1.2);
    g.fillStyle(FACE.tear, 0.9).fillEllipse(x - side * 9, y - 5, 2.5, 4);
  } else if (expression === 'lose') {
    g.beginPath().arc(ex, y + 7.5, 3.5, PI * 1.2, PI * 1.8).strokePath();
    g.fillStyle(FACE.tear, 0.9).fillEllipse(eyes[1] + 0.5, y + 2, 2, 3.5);
  } else g.lineBetween(ex - 2, y + 5, ex + 2, y + 5);
  if (old) g.fillStyle(HAIR_TONES.white).fillRoundedRect(ex - 5, y + 2.5, 10, 3, 1.5);
};

/** One pass of a figure in local units; palette colours are overridden by the rim pass. */
const paintFigure = (g, look, pose, palette, hand, face) => {
  const { side: s, mood, lift, yank } = pose;
  const { skin, cloth, pants, tone } = palette;
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
  else g.fillStyle(pants).fillRect(-8, hip - 2, 16, old ? 6 : 10);
  g.fillStyle(cloth).fillRoundedRect(lean / 2 - width / 2, shoulder, width, hip - shoulder + 2, 5);
  if (old) g.fillEllipse(lean / 2 + s * 4, hip - 10, 18, 16);
  g.fillStyle(skin).fillCircle(head.x, head.y, FIGURE.headR);
  HAIR_PAINTERS[look.hair](g, head, s, tone, pose.clock);
  if (face) drawFace(g, head, s, pose.expression, old);
  const from = { x: lean + s * 5, y: shoulder + 3 };
  const arm = (to) => {
    const bend = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 7 };
    g.lineStyle(chama ? 4 : 5, cloth).lineBetween(from.x, from.y, bend.x, bend.y);
    g.lineStyle(chama ? 3.5 : 4.5, skin).lineBetween(bend.x, bend.y, to.x, to.y);
  };
  arm(hand);
  if (mood === 'win') arm({ x: -s * 8, y: FIGURE.head - lift - 24 + sin(pose.clock * 12) * 4 });
  else if (mood === 'lose') arm({ x: -s * 8, y: hip + 10 });
  else arm({ x: hand.x - s * KID.carrete, y: hand.y + 9 });
};

/**
 * A kid (or rival) in any pose and size: a warm rim offset toward the sun, then the figure with its face.
 * `pose.hand` is in screen space, so the string hand can sit exactly on the physics anchor at any scale.
 */
const drawAvatar = (g, look, pose) => {
  const scale = pose.scale * look.scale;
  const hand = { x: (pose.hand.x - pose.x) / scale, y: (pose.hand.y - pose.y) / scale };
  const [rx, ry] = unit(SUN.x - pose.x, SUN.rise - pose.y);
  const pants = look.body === 1 ? mixColor(look.shirt, INK, 0.45) : PANTS;
  g.save().translateCanvas(pose.x, pose.y).scaleCanvas(scale, scale);
  g.save().translateCanvas(rx * 2, ry * 2);
  paintFigure(g, look, pose, { skin: RIM, cloth: RIM, pants: RIM, tone: RIM }, hand, false);
  g.restore();
  paintFigure(g, look, pose, { skin: look.skin, cloth: look.shirt, pants, tone: look.hairTone }, hand, true);
  if (!pose.mood) drawCarrete(g, hand.x - pose.side * KID.carrete, hand.y + 9, pose.turn);
  g.restore();
};

const KITE_POINTS = [[0, -44], [25, -12], [19, 17], [0, 26], [-19, 17], [-25, -12]];
const KITE_HUB = [0, -6];
const PAPER_ALPHA = 0.86;
const BRIDLE = 16;
const FLUTTER = { rate: 9, swing: 0.05, lean: 0.0015 };

/** Traditional papagayo: two-tone translucent paper panels, varillas, a dark outline and a lit edge. */
const drawPapagayo = (g, x, y, angle, scale, { colors, panels }, filled = true) => {
  const corners = posed(KITE_POINTS, x, y, angle, scale);
  const [hub] = posed([KITE_HUB], x, y, angle, scale);
  if (filled) {
    corners.forEach((corner, i) => {
      const next = corners[(i + 1) % corners.length];
      g.fillStyle(colors[panels[i]], PAPER_ALPHA).fillTriangle(hub.x, hub.y, corner.x, corner.y, next.x, next.y);
    });
    g.fillStyle(0xffffff, 0.2).fillTriangle(hub.x, hub.y, corners[0].x, corners[0].y, corners[1].x, corners[1].y);
  }
  if (!filled) {
    g.fillStyle(INK, 0.55).fillPoints(corners, true);
    g.lineStyle(1.5, CREAM, 0.7).strokePoints(corners, true);
    return;
  }
  g.lineStyle(max(1.5, 4 * scale), INK, 0.9).strokePoints(corners, true);
  g.lineStyle(2 * scale, STICK, 0.9)
    .lineBetween(corners[0].x, corners[0].y, corners[3].x, corners[3].y)
    .lineBetween(corners[5].x, corners[5].y, corners[1].x, corners[1].y);
  g.lineStyle(1.5 * scale, 0xffffff, 0.5).strokePoints(posed(KITE_POINTS, x, y, angle, scale * 0.9), true);
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

/** String from the kid's hand to the bridle: dark under-stroke for contrast; frayed, it pulses red and
 * sheds loose fibres where the rival blade is sawing. */
const drawString = (g, flyer, kite, rival) => {
  const curve = sagCurve(flyer.hand(kite), bridleKnot(kite), stringSag(kite));
  const wear = clamp01(kite.fray / FRAY.toughness);
  if (wear > 0) {
    g.lineStyle(3 + wear * 7, DANGER, wear * (0.3 + 0.25 * sin(flyer.clock * 14))).strokePoints(curve);
    const blade = rival.tail[TAIL.bladeFrom + 2];
    const at = curve.reduce((best, point) => (distance(point, blade) < distance(best, blade) ? point : best));
    g.fillStyle(DANGER, wear * 0.6).fillCircle(at.x, at.y, 4 + wear * 6);
    for (let k = 0; k < floor(wear * 12); k += 1) {
      const angle = k * 2.1 + flyer.clock * 3;
      const reach = 5 + (k % 3) * 3;
      g.lineStyle(1, 0xffc0b0, 0.8).lineBetween(at.x, at.y, at.x + cos(angle) * reach, at.y + sin(angle) * reach);
    }
  }
  g.lineStyle(3, INK, 0.35).strokePoints(curve);
  g.lineStyle(1.4, mixColor(CREAM, DANGER, wear)).strokePoints(curve);
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

/** Tail cord with alternating bows, then the steel hojilla with teeth. */
const drawTail = (g, kite, [a, b]) => {
  const { tail } = kite;
  g.lineStyle(1.5, INK, 0.8).strokePoints(tail.slice(0, TAIL.bladeFrom + 1));
  for (let i = 1; i < TAIL.bladeFrom; i += 1) drawBow(g, tail[i], tail[i - 1], i % 2 ? a : b);
  const blade = tail.slice(TAIL.bladeFrom);
  g.lineStyle(5, INK, 0.85).strokePoints(blade);
  g.lineStyle(2.5, STEEL).strokePoints(blade);
  g.fillStyle(0xffffff);
  blade.slice(1).forEach((p, i) => {
    const [dx, dy] = unit(p.x - blade[i].x, p.y - blade[i].y);
    const side = i % 2 ? 5 : -5;
    g.fillTriangle(p.x, p.y, p.x - dx * 6, p.y - dy * 6, p.x - dy * side - dx * 2, p.y + dx * side - dy * 2);
  });
};

/** JALAR: a fading whoosh ribbon along the kite's path. */
const drawTrail = (g, { trail, look }) => {
  trail.slice(1).forEach((point, i) => {
    const fade = 1 - i / TRAIL.points;
    g.lineStyle(TRAIL.width * fade, look.kite.colors[0], 0.35 * fade).lineBetween(trail[i].x, trail[i].y, point.x, point.y);
  });
};

// ---------------------------------------------------------------------------
// 14. Effects & audio
// ---------------------------------------------------------------------------

const SPARKS = {
  speed: { min: 80, max: 360 },
  lifespan: { min: 250, max: 700 },
  scale: { start: 0.9, end: 0 },
  gravityY: 520,
  blendMode: 'ADD',
  emitting: false,
};
const ROPE = { links: 10, gravity: 650, damping: 0.98, iterations: 4, kick: 7 };
const BOLT = { life: 0.4, branches: 4, steps: 5, reach: 14 };
const BURSTS = [0xffb060, 0x7fc4ff];
const BURST = { from: 0.6, to: 5, alpha: 0.85, ms: 380 };

/** A piece of snapped string from `from` (pinned) to the cut at `to`, whose loose end recoils. */
const makeRope = (from, to, pin) => {
  const points = Array.from({ length: ROPE.links + 1 }, (_, i) => {
    const x = lerp(from.x, to.x, i / ROPE.links);
    const y = lerp(from.y, to.y, i / ROPE.links);
    return { x, y, px: x, py: y };
  });
  const [ux, uy] = unit(from.x - to.x, from.y - to.y);
  const end = points[ROPE.links];
  end.px -= ux * ROPE.kick;
  end.py -= uy * ROPE.kick;
  return { points, pin, link: distance(from, to) / ROPE.links };
};

const stepRope = ({ points, pin, link }, dt) => {
  Object.assign(points[0], pin());
  points.slice(1).forEach((point) => {
    const vx = (point.x - point.px) * ROPE.damping;
    const vy = (point.y - point.py) * ROPE.damping;
    point.px = point.x;
    point.py = point.y;
    point.x += vx;
    point.y += vy + ROPE.gravity * dt * dt;
  });
  for (let k = 0; k < ROPE.iterations; k += 1) points.slice(1).forEach((point, i) => follow(point, points[i], link));
};

/** Spark bursts, snapped string pieces and electric bolts. */
class Fx {
  constructor(scene) {
    const spark = bake(scene, 'spark', SPRITES.spark, SPRITES.spark, paintDot(SPRITES.spark));
    this.sparks = scene.add.particles(0, 0, spark, { ...SPARKS, tint: [0xffffff, 0xffe08a, 0xff9a40] });
    this.zaps = scene.add.particles(0, 0, spark, { ...SPARKS, tint: [0xffffff, 0xbfe9ff, 0x5ab0ff] });
    const glow = bake(scene, 'glow', SPRITES.glow, SPRITES.glow, paintDot(SPRITES.glow));
    this.glows = BURSTS.map((color) => scene.add.image(0, 0, glow).setTint(color).setBlendMode('ADD').setVisible(false));
    this.animations = scene.tweens;
    this.rng = makeRng(26);
    this.clear();
  }

  clear() {
    this.ropes = [];
    this.bolts = [];
  }

  /** A local bloom of light (warm for a cut, cold for the cables) instead of a full-screen flash. */
  burst(kind, x, y) {
    const glow = this.glows[kind];
    this.animations.killTweensOf(glow);
    glow.setPosition(x, y).setVisible(true).setScale(BURST.from).setAlpha(BURST.alpha);
    this.animations.add({ targets: glow, scale: BURST.to, alpha: 0, duration: BURST.ms, ease: 'Quad.easeOut' });
  }

  /** The cut string splits: the kid keeps one falling piece, the tumbling kite trails the other. */
  snap(at, hand, fall) {
    this.sparks.explode(40, at.x, at.y);
    this.burst(0, at.x, at.y);
    this.ropes.push(makeRope(hand(), at, hand), makeRope(fall, at, () => ({ x: fall.x, y: fall.y })));
  }

  zap(x, y) {
    this.zaps.explode(50, x, y);
    this.burst(1, x, y);
    this.bolts.push({ x, y, life: BOLT.life });
  }

  update(dt) {
    this.ropes.forEach((rope) => stepRope(rope, dt));
    this.bolts.forEach((bolt) => (bolt.life -= dt));
    this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
  }

  draw(g) {
    this.ropes.forEach(({ points }) => g.lineStyle(1.4, CREAM, 0.9).strokePoints(points));
    this.bolts.forEach(({ x, y, life }) => {
      for (let branch = 0; branch < BOLT.branches; branch += 1) {
        const path = [{ x, y }];
        let angle = this.rng() * TAU;
        for (let step = 0; step < BOLT.steps; step += 1) {
          angle += (this.rng() - 0.5) * 1.6;
          const last = path[step];
          path.push({ x: last.x + cos(angle) * BOLT.reach, y: last.y + sin(angle) * BOLT.reach });
        }
        g.lineStyle(5, 0x5ab0ff, life).strokePoints(path);
        g.lineStyle(1.5, 0xffffff, life * 2).strokePoints(path);
      }
    });
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
// A bright D major flourish, plucked like a cuatro, for every point won.
const JINGLE = [62, 66, 69, 74, 78];
const SCRATCH_GAP = 0.08;
// Each sound is a list of voices: [wave or 'noise', frequency, filter type, filter sweep from, to, gain, seconds, delay].
const SOUNDS = {
  whoosh: [['noise', 0, 'bandpass', 400, 2400, 0.35, 0.3]],
  scratch: [['noise', 0, 'highpass', 3000, 1800, 0.2, 0.05]],
  snap: [['noise', 0, 'highpass', 5000, 5000, 0.9, 0.07], ['sine', 90, 'lowpass', 400, 200, 0.5, 0.3]],
  crackle: [
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => ['noise', 0, 'bandpass', 2500 + i * 300, 2500 + i * 300, 0.5, 0.03, i * 0.045]),
    ['sawtooth', 55, 'lowpass', 4000, 4000, 0.2, 0.5],
  ],
  thud: [['sine', 70, 'lowpass', 300, 300, 0.5, 0.35]],
  // Dull click for a JALAR pressed without enough AIRE.
  refuse: [['square', 160, 'lowpass', 900, 900, 0.12, 0.07]],
  clink: [['triangle', 1800, 'lowpass', 4000, 4000, 0.2, 0.12]],
  squawk: [['sawtooth', 420, 'lowpass', 1400, 600, 0.15, 0.18]],
  gust: [['noise', 0, 'lowpass', 300, 1500, 0.5, 1.2]],
  go: [['triangle', 880, 'lowpass', 4000, 4000, 0.2, 0.15]],
  jingle: JINGLE.map((midi, i) => ['triangle', midiToHz(midi), 'lowpass', 3500, 900, 0.3, 0.45, i * 0.08]),
};

/** Light synthesised SFX over a wind bed; silent without an AudioContext and never needed to play. */
const createSfx = (ctx) => {
  let quietUntil = 0;
  let bed = null;
  const master = ctx && ctx.createGain();
  const noise = ctx && ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  if (ctx) {
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    window.addEventListener('keydown', () => ctx.state === 'suspended' && ctx.resume());
  }
  const noiseSource = () => Object.assign(ctx.createBufferSource(), { buffer: noise, loop: true });

  /** One voice through a sweeping filter and a decaying gain to the master bus. */
  const voice = ([wave, frequency, type, from, to, gain, duration, delay = 0]) => {
    const start = ctx.currentTime + delay;
    const source = wave === 'noise' ? noiseSource() : Object.assign(ctx.createOscillator(), { type: wave });
    if (frequency) source.frequency.value = frequency;
    const filter = Object.assign(ctx.createBiquadFilter(), { type });
    const amp = ctx.createGain();
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
    source.stop(start + duration);
  };

  return {
    play(name) {
      if (ctx) SOUNDS[name].forEach(voice);
    },

    /** Fray scratches fire every frame while a blade saws, so they are spaced out. */
    scratch() {
      if (!ctx || ctx.currentTime < quietUntil) return;
      quietUntil = ctx.currentTime + SCRATCH_GAP;
      this.play('scratch');
    },

    /** Looping filtered noise whose loudness and brightness follow the wind. */
    setWind(level) {
      if (!ctx) return;
      if (!bed) {
        bed = { source: noiseSource(), filter: Object.assign(ctx.createBiquadFilter(), { type: 'lowpass' }), amp: ctx.createGain() };
        bed.amp.gain.value = 0;
        bed.source.connect(bed.filter).connect(bed.amp).connect(master);
        bed.source.start();
      }
      bed.amp.gain.setTargetAtTime(0.03 + level * 0.06, ctx.currentTime, 0.4);
      bed.filter.frequency.setTargetAtTime(250 + level * 700, ctx.currentTime, 0.4);
    },
  };
};

const sfx = createSfx(createAudioContext());

// ---------------------------------------------------------------------------
// 15. Duel view & HUD
// ---------------------------------------------------------------------------

const HUD = { margin: 24, nameY: 24, pipY: 56, pipGap: 32, meterY: 80, meterW: 150, meterH: 14 };
// Venezuelan tricolour streaming from a pole at the top centre: it waves in gusts, droops in a calm.
const FLAG = { x: W / 2, y: 14, length: 58, stripe: 6, droop: 18 };
const FLAG_COLORS = [0xffcc00, 0x00247d, 0xcf142b];
const CUES = {
  viene: { text: '¡SE VIENE LA CALMA!', color: DIM },
  calma: { text: '¡CALMA! · JALA PARA SUBIR', color: CREAM },
  // The first round's calm teaches the hold instead.
  primera: { text: 'MANTÉN B1 PARA JALAR', color: GOLD },
  rafaga: { text: '¡RÁFAGA!', color: GOLD },
};
const VERDICTS = {
  cut: ['¡CORTADO!', 'LE CORTARON EL HILO'],
  line: ['¡CHISPAZO!', 'SE ENREDÓ EN EL CABLE'],
  ground: ['¡SE CAYÓ!', 'ATERRIZÓ EN LA AZOTEA'],
  draw: ['¡EMPATE!', 'LOS DOS AL SUELO'],
};
const GO_SHOWN = 0.7;
const REFUSE_S = 0.3;
const COUNTDOWN_STEPS = 3;
// Camera choreography for points: hitstop is applied by the duel loop.
const SHOT = { zoom: 1.08, zoomMs: 260, shakeMs: 280, shake: 0.006, resetMs: 500, hitstop: 0.08 };
const FOCUS_EASE = 2;
// Without an AudioContext the SFX stay silent: the title's attract demo plays through this one.
const SILENCE = createSfx(null);
const EVENT_SOUNDS = { go: 'go', refused: 'refuse', dash: 'whoosh', clash: 'clink', stun: 'squawk', ventarron: 'gust' };

/** Banner text, detail line and colour for the current moment of the duel. */
const bannerFor = (duel) => {
  if (duel.phase === 'countdown') {
    return [String(ceil((duel.clock / ROUND.countdown) * COUNTDOWN_STEPS)), `RONDA ${duel.round + 1}`, GOLD];
  }
  if (duel.verdict) {
    const { cause, winner } = duel.verdict;
    return [...VERDICTS[cause], winner === null ? CREAM : PLAYER_COLORS[winner]];
  }
  return duel.elapsed < GO_SHOWN ? ['¡A VOLAR!', '', GOLD] : ['', '', CREAM];
};

/** Repaints a label with a vertical gradient from cream into `color`: chunky arcade banner type. */
const shine = (text, color) => {
  const fill = text.context.createLinearGradient(0, 0, 0, text.height);
  fill.addColorStop(0.2, css(CREAM));
  fill.addColorStop(0.8, css(color));
  return text.setFill(fill);
};

/** Venezuelan tricolour on a pole: it streams with the wind (waving harder in gusts) and droops in a calm. */
const drawFlag = (g, drift, clock) => {
  const strength = min(1, abs(drift.vx) / BREEZE.speed);
  const tipX = FLAG.x + FLAG.length * max(0.35, strength) * (drift.vx < 0 ? -1 : 1);
  const tipY = FLAG.droop * (1 - strength) + sin(clock * 9) * 3 * strength;
  FLAG_COLORS.forEach((color, row) => {
    const [top, bottom] = [row, row + 1].map((edge) => FLAG.y + edge * FLAG.stripe);
    g.fillStyle(color).fillPoints([{ x: FLAG.x, y: top }, { x: tipX, y: top + tipY }, { x: tipX, y: bottom + tipY }, { x: FLAG.x, y: bottom }], true);
  });
  g.lineStyle(3, INK).lineBetween(FLAG.x, FLAG.y - 4, FLAG.x, FLAG.y + 34);
  g.fillStyle(CREAM).fillCircle(FLAG.x, FLAG.y - 5, 3);
};

/** Names, score pips (little papagayos), labelled JALAR meters, the flag and the banners. */
class Hud {
  constructor(scene, names, kites) {
    this.kites = kites;
    this.animations = scene.tweens;
    this.g = scene.add.graphics();
    const left = (player) => (player === 0 ? HUD.margin : W - HUD.margin - HUD.meterW);
    const tags = names.map((name, player) =>
      label(scene, player === 0 ? HUD.margin : W - HUD.margin, HUD.nameY, name, 18, PLAYER_COLORS[player]).setOrigin(player, 0.5),
    );
    this.meters = [0, 1].map((player) => label(scene, left(player) + HUD.meterW / 2, HUD.meterY + HUD.meterH / 2, 'B1 JALAR · MANTÉN', 10));
    // Banners sit above the fight (which happens around y 150-350) so they never hide a cut.
    this.banner = label(scene, W / 2, 118, '', 60).setShadow(0, 6, css(INK), 0, true, true);
    this.detail = label(scene, W / 2, 166, '', 18);
    this.storm = label(scene, W / 2, 100, '¡VENTARRÓN!', 24, GOLD);
    this.cue = label(scene, W / 2, 130, '', 22);
    scene.tweens.add({ targets: [this.storm, this.cue], scale: 1.08, duration: 300, yoyo: true, repeat: -1 });
    this.shown = null;
    this.refusedAt = [-REFUSE_S, -REFUSE_S];
    this.clock = 0;
    this.left = left;
    this.objects = [this.g, ...tags, ...this.meters, this.banner, this.detail, this.storm, this.cue];
  }

  update(duel, drift, clock) {
    this.clock = clock;
    const g = this.g.clear();
    drawFlag(g, drift, clock);
    duel.kites.forEach((kite) => this.drawPlayer(g, kite, duel.score[kite.player], clock, this.kites[kite.player]));
    const banner = bannerFor(duel);
    this.showBanner(banner);
    // Wind cues wait until the banner is gone so the two never overlap.
    const flying = duel.phase === 'fly' && !banner[0];
    this.storm.setVisible(duel.ventarron && flying);
    // JALA PARA SUBIR only once the calm has really started, when a JALAR visibly lifts the kite.
    const coming = windCue(duel) === 'calma' && weatherAt(duel).wind >= WIND.lull;
    const kind = coming ? 'viene' : windCue(duel);
    const cue = flying && CUES[kind === 'calma' && duel.round === 0 ? 'primera' : kind];
    this.cue.setVisible(Boolean(cue));
    if (cue) this.cue.setText(cue.text).setColor(css(cue.color));
  }

  /** JALAR pressed without enough AIRE: the meter shakes and flashes red. */
  refuse(player) {
    this.refusedAt[player] = this.clock;
  }

  drawPlayer(g, kite, points, clock, design) {
    const refused = max(0, REFUSE_S - (clock - this.refusedAt[kite.player]));
    const left = this.left(kite.player) + sin(clock * 90) * refused * 20;
    for (let pip = 0; pip < ROUND.wins; pip += 1) {
      drawPapagayo(g, left + 12 + pip * HUD.pipGap, HUD.pipY, 0, 0.38, design, pip < points);
    }
    const charge = kite.air;
    const ready = canPull(kite);
    g.fillStyle(INK, 0.75).fillRoundedRect(left - 2, HUD.meterY - 2, HUD.meterW + 4, HUD.meterH + 4, 5);
    g.fillStyle(refused ? DANGER : ready ? PLAYER_COLORS[kite.player] : DIM, ready ? 0.75 + 0.25 * sin(clock * 8) : 0.6);
    g.fillRoundedRect(left, HUD.meterY, max(HUD.meterH, HUD.meterW * charge), HUD.meterH, 4);
    this.meters[kite.player].setAlpha(ready ? 1 : 0.6);
  }

  showBanner([text, detail, color]) {
    const key = `${text}|${color}`;
    if (key === this.shown) return;
    this.shown = key;
    shine(this.banner.setText(text), color);
    this.detail.setText(detail);
    if (text) this.animations.add({ targets: this.banner, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }
}

/**
 * Everything the duel shows: backdrop, wind, birds, kids, kites, effects, camera work and HUD.
 * Without player names it is the title's attract demo: no HUD, no camera moves and no sound.
 */
class DuelView {
  constructor(scene, names, looks) {
    this.attract = !names;
    this.flyers = looks.map((look, player) => new Flyer(player, look));
    this.audio = this.attract ? SILENCE : sfx;
    this.camera = scene.cameras.main.setBounds(0, 0, W, H);
    this.backdrop = new Backdrop(scene);
    this.back = scene.add.graphics();
    this.backdrop.addForeground(scene);
    const glow = bake(scene, 'glow', SPRITES.glow, SPRITES.glow, paintDot(SPRITES.glow));
    this.glows = looks.map(({ kite }) => scene.add.image(0, 0, glow).setTint(kite.colors[0]).setBlendMode('ADD'));
    this.front = scene.add.graphics();
    this.glints = looks.map(() => scene.add.image(0, 0, glow).setBlendMode('ADD'));
    this.fx = new Fx(scene);
    if (!this.attract) this.addHud(scene, names);
    this.wind = new WindParticles();
    this.birds = new Birds();
    this.day = 0;
    this.clock = 0;
    this.focus = W / 2;
  }

  /** The HUD gets its own camera so zooms and shakes never move it. */
  addHud(scene, names) {
    const world = scene.children.list.slice();
    this.hud = new Hud(scene, names, this.flyers.map((flyer) => flyer.look.kite));
    this.camera.ignore(this.hud.objects);
    scene.cameras.add(0, 0, W, H).ignore(world);
  }

  shoot(move) {
    if (!this.attract) move(this.camera);
  }

  /** `dt` is real time (the cut kite tumbles at full speed); the rest of the world runs at `slowmo`. */
  update(duel, dt, slowmo) {
    const world = dt * slowmo;
    this.clock += world;
    // The city feels the wind before the kites do: everything decorative shows the coming weather.
    const ahead = weatherAt(duel, duel.elapsed + WIND.lead);
    const drift = windDrift(ahead);
    this.day = lerp(this.day, dayPhase(duel.round), min(1, world * DAY.ease));
    this.focus = lerp(this.focus, (duel.kites[0].x + duel.kites[1].x) / 2, min(1, world * FOCUS_EASE));
    this.backdrop.update(this.day, drift, world, this.focus);
    this.wind.update(drift, world);
    this.birds.update(duel.zamuros, world);
    this.fx.update(dt);
    duel.kites.forEach((kite, player) => {
      const flyer = this.flyers[player];
      if (flyer.update(kite, moodOf(duel.verdict, player), world)) this.audio.scratch();
      if (flyer.fall) stepFall(flyer.fall, ahead, dt);
    });
    this.audio.setWind(ahead.wind);
    this.draw(duel, drift);
    if (this.hud) this.hud.update(duel, drift, this.clock);
  }

  draw(duel, drift) {
    const { back, front, clock } = this;
    back.clear();
    this.wind.draw(back, drift);
    this.birds.draw(back, clock);
    duel.zamuros.forEach((zamuro) => drawVulture(back, zamuro.x, zamuro.y, sin(clock * 12 + zamuro.x * 0.05), 1));
    front.clear();
    drawRooftops(front, this.flyers);
    this.fx.draw(front);
    duel.kites.forEach((kite, player) => this.drawKite(kite, duel.kites[1 - player], this.flyers[player]));
  }

  /** A flying kite on its string, or the tumbling copy of a cut one. */
  drawKite(kite, rival, flyer) {
    const { front } = this;
    const shown = flyer.fall || kite;
    const angle = flyer.fall ? flyer.fall.spin : kiteAngle(kite, flyer);
    drawTrail(front, flyer);
    if (!kite.free) drawString(front, flyer, kite, rival);
    drawTail(front, shown, flyer.look.kite.colors);
    drawPapagayo(front, shown.x, shown.y, angle, 1, flyer.look.kite);
    this.glows[kite.player].setPosition(shown.x, shown.y).setScale(1.4).setAlpha(0.25 + 0.3 * this.day);
    const tip = shown.tail[TAIL.segments];
    const shimmer = 0.35 + 0.65 * abs(sin(flyer.clock * 5 + kite.player * 2));
    this.glints[kite.player].setPosition(tip.x, tip.y).setAlpha(shimmer).setScale(0.35, 0.12).setRotation(flyer.clock);
  }

  /** Effects, camera work and sounds for each duel event. */
  react(event, duel) {
    const { type, player } = event;
    const kite = duel.kites[player];
    const [a, b] = duel.kites;
    const reactions = {
      refused: () => this.hud && this.hud.refuse(player),
      dash: () => this.flyers[player].dash(),
      point: () => this.point(event, duel),
      round: () => this.reset(),
      clash: () => this.fx.sparks.explode(20, (a.x + b.x) / 2, (a.y + b.y) / 2),
      stun: () => this.fx.sparks.explode(10, kite.x, kite.y),
      ventarron: () => this.shoot((camera) => camera.shake(SHOT.shakeMs * 2, SHOT.shake / 2)),
    };
    if (reactions[type]) reactions[type]();
    if (EVENT_SOUNDS[type]) this.audio.play(EVENT_SOUNDS[type]);
  }

  point({ cause, loser, winner }, duel) {
    if (cause === 'cut') this.cut(duel, loser);
    else if (cause === 'line') this.chispazo(duel.kites[loser]);
    else this.audio.play('thud');
    if (winner !== null) this.audio.play('jingle');
  }

  /** A warm bloom, shake and a push-in on the cut point while the string snaps and the kite tumbles away. */
  cut(duel, loser) {
    const victim = duel.kites[loser];
    const blade = duel.kites[1 - loser].tail[TAIL.segments];
    const at = nearestOnSegment(blade, victim.anchor, victim);
    const flyer = this.flyers[loser];
    flyer.fall = createFall(victim);
    this.fx.snap(at, () => flyer.hand(victim), flyer.fall);
    this.shoot((camera) => {
      camera.shake(SHOT.shakeMs, SHOT.shake);
      camera.zoomTo(SHOT.zoom, SHOT.zoomMs);
      camera.pan(at.x, at.y, SHOT.zoomMs);
    });
    this.audio.play('snap');
  }

  chispazo(kite) {
    this.fx.zap(kite.x, kite.y);
    this.birds.scatter();
    this.shoot((camera) => camera.shake(SHOT.shakeMs, SHOT.shake));
    this.audio.play('crackle');
  }

  reset() {
    this.fx.clear();
    this.birds.reset();
    this.flyers.forEach((flyer) => flyer.reset());
    this.shoot((camera) => {
      camera.zoomTo(1, SHOT.resetMs);
      camera.pan(W / 2, H / 2, SHOT.resetMs);
    });
  }
}

/** Living backdrop for menus: a time of day, a breathing breeze and the two kids (who may celebrate). */
class Scenery {
  constructor(scene, day, looks, moods = [null, null]) {
    this.backdrop = new Backdrop(scene);
    this.g = scene.add.graphics();
    this.backdrop.addForeground(scene);
    this.kids = scene.add.graphics();
    this.wind = new WindParticles();
    this.moods = moods;
    this.flyers = looks.map((look, player) => new Flyer(player, look));
    this.day = day;
    this.clock = 0;
  }

  update(dt) {
    this.clock += dt;
    const weather = { wind: 1 + 0.4 * sin(this.clock * 0.5), gust: 80 * sin(this.clock * 0.3) };
    const drift = windDrift(weather);
    this.backdrop.update(this.day, drift, dt, W / 2);
    this.wind.update(drift, dt);
    this.wind.draw(this.g.clear(), drift);
    this.flyers.forEach((flyer, player) => flyer.pose(this.moods[player], dt));
    drawRooftops(this.kids.clear(), this.flyers);
    sfx.setWind(weather.wind / 2);
  }
}

// ---------------------------------------------------------------------------
// 16. UI helpers
// ---------------------------------------------------------------------------

const MENU_GAP = 44;

/** Centred text with an ink outline so it reads over the sky. */
const label = (scene, x, y, text, size = 24, color = CREAM) =>
  scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: css(color),
      stroke: css(INK),
      strokeThickness: ceil(size / 6),
      align: 'center',
    })
    .setOrigin(0.5);

const panel = (scene, x, y, width, height) =>
  scene.add
    .graphics()
    .fillStyle(INK, 0.85)
    .fillRoundedRect(x, y, width, height, 10)
    .lineStyle(2, GOLD, 0.6)
    .strokeRoundedRect(x, y, width, height, 10);

/** Vertical joystick menu with a triangle cursor; confirming locks it so a choice fires once. */
class Menu {
  constructor(scene, x, y, items, onSelect) {
    this.onSelect = onSelect;
    this.index = 0;
    this.locked = false;
    this.items = items.map((text, i) => label(scene, x, y + i * MENU_GAP, text, 28));
    this.cursor = scene.add.triangle(0, 0, 0, 0, 18, 11, 0, 22, GOLD);
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

  highlight() {
    this.items.forEach((item, i) => {
      const selected = i === this.index;
      item.setColor(css(selected ? GOLD : CREAM)).setScale(selected ? 1.1 : 1);
    });
    const item = this.items[this.index];
    this.cursor.setPosition(item.x - item.displayWidth / 2 - 26, item.y);
  }

  destroy() {
    this.items.forEach((item) => item.destroy());
    this.cursor.destroy();
  }
}

// ---------------------------------------------------------------------------
// 17. Scenes
// ---------------------------------------------------------------------------

const BOARD = { x: 230, y: 452, width: 340, height: 124, row: 17 };
const PAGE_MS = 5000;

/** Top-five table for the bottom panel; fill() repaints it and can highlight one rank. */
const addBoard = (scene) => {
  const title = label(scene, W / 2, BOARD.y + 18, 'MEJORES PAPAGAYEROS', 16, GOLD);
  const rows = Array.from({ length: LEADERBOARD_SIZE }, (_, i) => label(scene, W / 2, BOARD.y + 42 + i * BOARD.row, '', 14));
  const fill = (entries, highlight = -1) =>
    entries.forEach(({ name, score }, i) => {
      const marked = i === highlight;
      rows[i].setText(`${i + 1}. ${name}   ${score}`).setColor(css(marked ? PLAYER_COLORS[0] : CREAM));
      if (marked) scene.tweens.add({ targets: rows[i], alpha: 0.3, duration: 260, yoyo: true, repeat: -1 });
    });
  fill(Leaderboard.sanitize(null));
  return { container: scene.add.container(0, 0, [title, ...rows]), fill };
};

const addPanel = (scene) => panel(scene, BOARD.x, BOARD.y, BOARD.width, BOARD.height);

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

class CpuPilot {
  constructor(level, player) {
    this.cpu = createCpu(level, player, makeRng(Date.now() + player));
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
    Object.assign(this, { duel, pilots, view, listen, pressed: new Set(), lag: 0, hitstop: 0 });
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
    this.view.update(this.duel, frozen ? 0 : dt, this.duel.phase === 'verdict' ? ROUND.slowmo : 1);
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

// The attract demo: two CPU rivals fight for real behind the menu, and start over after each match.
const ATTRACT = { levels: [2, 3], restartMs: 2500 };

class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    Arcade.drain();
    this.view = new DuelView(this, null, ATTRACT.levels.map((level) => RIVAL_LOOKS[level]));
    this.startDemo();
    this.addLogo();
    label(this, W / 2, 150, 'DUELO DE PAPAGAYOS SOBRE CARACAS', 18);
    this.menu = new Menu(this, W / 2, 228, ['1 JUGADOR', '2 JUGADORES'], (index) =>
      this.scene.start('Build', { mode: index === 0 ? 'solo' : 'versus' }),
    );
    addPanel(this);
    this.board = addBoard(this);
    Leaderboard.load().then((entries) => this.board.container.active && this.board.fill(entries));
    this.pages = [this.addHelp(), this.board.container];
    this.showPage(0);
    this.time.addEvent({ delay: PAGE_MS, loop: true, callback: () => this.showPage(1 - this.page) });
    label(this, W / 2, 588, 'PLATANUS HACK 26 · CARACAS', 11, DIM);
  }

  startDemo() {
    this.view.reset();
    const pilots = ATTRACT.levels.map((level, player) => new CpuPilot(level, player));
    this.demo = new DuelLoop(createDuel(makeRng(Date.now())), pilots, this.view, ({ type }) => {
      if (type === 'over') this.time.delayedCall(ATTRACT.restartMs, () => this.startDemo());
    });
  }

  /** Chunky warm logo that sways like a kite on its string. */
  addLogo() {
    const logo = label(this, W / 2, 86, '¡PAPAGAYOS!', 76).setStroke(css(INK), 12);
    shine(logo, 0xff7a2f).setShadow(0, 7, css(INK), 0, true, true);
    this.tweens.add({ targets: logo, angle: { from: -3, to: 3 }, y: 94, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  addHelp() {
    const y = BOARD.y;
    return this.add.container(0, 0, [
      label(this, W / 2, y + 18, 'CÓMO SE JUEGA', 16, GOLD),
      label(this, W / 2, y + 48, 'JOYSTICK: DIRIGIR · B1: JALAR · B2: RECOGER', 13),
      label(this, W / 2, y + 74, 'Serrucha el hilo rival con tu cola', 15, PLAYER_COLORS[0]),
      label(this, W / 2, y + 100, 'Ojo con los cables, la calma y los zamuros', 12, DIM),
    ]);
  }

  showPage(page) {
    this.page = page;
    this.pages.forEach((container, i) => container.setVisible(i === page));
  }

  update(time, delta) {
    this.demo.update(delta / 1000);
    for (const code of Arcade.drain()) this.menu.handle(code);
  }
}

/** Scenes over the living backdrop: input is drained on entry and idle time builds up while nobody presses. */
class BackdropScene extends Phaser.Scene {
  stage(day, looks, moods) {
    Arcade.drain();
    this.idle = 0;
    this.scenery = new Scenery(this, day, looks, moods);
  }

  update(time, delta) {
    this.scenery.update(delta / 1000);
    const presses = Arcade.drain();
    this.idle = presses.length ? 0 : this.idle + delta;
    this.step(presses, delta);
  }
}

// "ARMA TU PAPAGAYERO": each player builds a look before playing; the last choice is remembered.
const BUILD = { top: 92, height: 386, width: 372, rowsY: 150, rowGap: 46, idleMs: 30000, leaveMs: 700, preview: 2.1 };
const ROW_TITLES = ['CHAMO / CHAMA', 'PEINADO', 'PIEL', 'FRANELA', 'PAPAGAYO'];

/** Text for a row's value: names for body and hair, a counter for colours and kites (the preview shows them). */
const rowValue = (choice, row) => {
  if (row === 'body') return BODY_NAMES[choice.body];
  if (row === 'hair') return HAIR_NAMES[choice.hair];
  return `${choice[row] + 1} / ${ROW_SIZES[row]}`;
};

/** Hanging tail points under a kite drawn outside the duel (menus and cards). */
const restingTail = (x, y, clock) =>
  Array.from({ length: TAIL.segments + 1 }, (_, i) => ({ x: x + sin(clock * 2 + i * 0.6) * i * 0.7, y: y + KITE.radius + i * TAIL.segment * 0.8 }));

/** A kite with its tail floating at (x, y), as on the cards and the customisation screen. */
const drawShowKite = (g, kite, x, y, scale, clock) => {
  drawTail(g, { tail: restingTail(x, y, clock) }, kite.colors);
  drawPapagayo(g, x, y, sin(clock * 1.5) * 0.1, scale, kite);
};

/** A large, standing avatar holding its kite string toward (kite.x, kite.y). */
const drawPortrait = (g, look, { x, y, scale, side, mood, clock }, kite) => {
  const reach = scale * look.scale;
  const hand = { x: x + side * 14 * reach, y: y - 50 * reach };
  g.lineStyle(1.5, CREAM, 0.8).lineBetween(hand.x, hand.y, kite.x, kite.y + 20);
  drawShowKite(g, look.kite, kite.x, kite.y, 0.8, clock);
  drawAvatar(g, look, { x, y, scale, side, mood, expression: mood || 'focus', lift: 0, yank: 0, turn: clock * 2, clock, hand });
};

class BuildScene extends BackdropScene {
  constructor() {
    super('Build');
  }

  init({ mode }) {
    Object.assign(this, { mode, clock: 0, touched: false, leaving: false });
  }

  create() {
    this.choices = sanitizeChoices(null);
    this.players = this.mode === 'solo' ? [0] : [0, 1];
    this.stage(0.3, looksFor(this.mode, 0, this.choices));
    shine(label(this, W / 2, 46, 'ARMA TU PAPAGAYERO', 38), GOLD);
    this.columns = this.players.map((player) => this.addColumn(player, this.players.length === 1 ? W / 2 : 200 + player * 400));
    this.g = this.add.graphics();
    label(this, W / 2, 588, 'JOYSTICK: ELEGIR · B1: ¡LISTO!', 12, DIM);
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
    label(this, x, BUILD.top + 20, `JUGADOR ${player + 1}`, 16, PLAYER_COLORS[player]);
    const rowX = x + 86;
    const values = LOOK_ROWS.map((row, i) => {
      const y = BUILD.rowsY + i * BUILD.rowGap;
      label(this, rowX, y, ROW_TITLES[i], 11, DIM);
      return label(this, rowX, y + 18, '', 16);
    });
    const status = label(this, x, BUILD.top + BUILD.height - 22, '', 18);
    return { x, rowX, values, status, row: 0, ready: false };
  }

  refresh(player) {
    const column = this.columns[player];
    const choice = this.choices[player];
    column.values.forEach((value, i) => {
      const text = rowValue(choice, LOOK_ROWS[i]);
      const selected = i === column.row && !column.ready;
      value.setText(selected ? `‹ ${text} ›` : text).setColor(css(selected ? GOLD : CREAM));
    });
    column.status.setText(column.ready ? '¡LISTO!' : 'B1: ¡LISTO!').setColor(css(column.ready ? 0x7dff8a : DIM));
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
    const { choices, mode } = this;
    AvatarStore.save(choices);
    this.time.delayedCall(BUILD.leaveMs, () =>
      this.scene.start(mode === 'solo' ? 'Intro' : 'Duel', { mode, level: 0, total: 0, choices }),
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

const INTRO_MS = 2800;
const CARD = { left: 100, top: 150, width: 600, height: 280, textX: 470 };

/** Ladder card before each solo duel: who the next rival is (with their look and kite) and the points so far. */
class IntroScene extends BackdropScene {
  constructor() {
    super('Intro');
  }

  init({ level, total, choices = DEFAULT_CHOICES }) {
    Object.assign(this, { level, total, choices, elapsed: 0, leaving: false });
  }

  create() {
    this.stage(0, looksFor('solo', this.level, this.choices));
    const { name, barrio, motto } = RIVALS[this.level];
    const { left, top, width, height, textX } = CARD;
    const card = this.add.container(0, 0, [
      panel(this, left, top, width, height),
      label(this, textX, top + 34, `RIVAL ${this.level + 1} DE ${RIVALS.length}`, 20, GOLD),
      label(this, textX, top + 90, name, 46, PLAYER_COLORS[1]),
      label(this, textX, top + 138, `de ${barrio}`, 22),
      label(this, textX, top + 172, motto, 15, DIM),
      label(this, textX, top + 240, `PUNTOS ${this.total}`, 16),
    ]);
    this.portrait = this.add.graphics();
    card.add(this.portrait);
    this.tweens.add({ targets: card, alpha: { from: 0, to: 1 }, y: { from: 40, to: 0 }, duration: 420, ease: 'Back.easeOut' });
  }

  step(presses, delta) {
    this.elapsed += delta;
    const clock = this.elapsed / 1000;
    const { left, top, height } = CARD;
    // The rival looks up at its kite in the card's corner, away from the text.
    const pose = { x: left + 140, y: top + height - 16, scale: 1.9, side: -1, mood: null, clock };
    drawPortrait(this.portrait.clear(), RIVAL_LOOKS[this.level], pose, { x: left + 48, y: top + 56 });
    const skipped = presses.some((code) => MENU_CODES.confirm.includes(code));
    if (this.leaving || (!skipped && this.elapsed < INTRO_MS)) return;
    this.leaving = true;
    this.scene.start('Duel', { mode: 'solo', level: this.level, total: this.total, choices: this.choices });
  }
}

const RESULT_DELAY_MS = 900;

class DuelScene extends Phaser.Scene {
  constructor() {
    super('Duel');
  }

  init({ mode, level = 0, total = 0, choices = DEFAULT_CHOICES }) {
    Object.assign(this, { mode, level, total, choices, earned: 0, stats: createStats() });
  }

  create() {
    Arcade.drain();
    const solo = this.mode === 'solo';
    this.names = solo ? ['TÚ', RIVALS[this.level].name] : ['JUGADOR 1', 'JUGADOR 2'];
    const pilots = [new HumanPilot(0), solo ? new CpuPilot(this.level, 1) : new HumanPilot(1)];
    const view = new DuelView(this, this.names, looksFor(this.mode, this.level, this.choices));
    const lull = solo ? ladderLull(this.level) : LULLS.versus;
    this.loop = new DuelLoop(createDuel(makeRng(Date.now()), lull), pilots, view, (event) => this.record(event));
  }

  record(event) {
    tally(this.stats, event);
    if (event.type === 'point' && this.mode === 'solo') this.earned += pointScore(event, this.loop.duel.elapsed);
    if (event.type === 'over') this.time.delayedCall(RESULT_DELAY_MS, () => this.finish());
  }

  update(time, delta) {
    this.loop.press(Arcade.drain());
    this.loop.update(delta / 1000);
  }

  finish() {
    const { mode, level, names, stats, total, choices } = this;
    const { winner, score, round } = this.loop.duel;
    const earned = this.earned + (mode === 'solo' ? matchBonus(winner, score, level) : 0);
    this.scene.start('Result', { mode, level, names, stats, winner, score: [...score], round, earned, total: total + earned, choices });
  }
}

const RESULT_IDLE_MS = 25000;
const OUTCOME_TITLES = { next: '¡GANASTE!', champion: '¡REY DEL CIELO DE CARACAS!', defeat: '¡TE GANARON!' };
const STAT_ROWS = [
  ['CORTES', 'cuts'],
  ['CHOQUES', 'crashes'],
  ['JALONES', 'dashes'],
];
const STAT_COLUMNS = [300, 500];
const STATS_Y = 186;

class ResultScene extends BackdropScene {
  constructor() {
    super('Result');
  }

  init(summary) {
    Object.assign(this, { summary, leaving: false });
  }

  create() {
    const { mode, level, winner, round, total, earned, choices = DEFAULT_CHOICES } = this.summary;
    this.outcome = mode === 'solo' ? ladderOutcome(winner, level) : 'versus';
    const moods = [0, 1].map((player) => (player === winner ? 'win' : 'lose'));
    this.stage(dayPhase(round), looksFor(mode, level, choices), moods);
    const champion = this.outcome === 'champion';
    shine(label(this, W / 2, 96, this.title(), champion ? 40 : 52), PLAYER_COLORS[winner]);
    label(this, W / 2, 146, this.subtitle(), 18, GOLD);
    this.addStats();
    if (mode === 'versus') {
      this.menu = new Menu(this, W / 2, 384, ['REVANCHA', 'MENÚ PRINCIPAL'], (index) =>
        index === 0 ? this.leave('Duel', { mode, choices }) : this.leave('Title'),
      );
      return;
    }
    label(this, W / 2, 364, `TOTAL ${total}   (+${earned})`, 26);
    const prompt = label(this, W / 2, 440, this.outcome === 'next' ? 'PULSA START PARA SEGUIR' : 'PULSA START', 16);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
    if (this.outcome !== 'next') this.checkRecord(total);
  }

  title() {
    const { winner, names } = this.summary;
    return this.outcome === 'versus' ? `¡GANÓ ${names[winner]}!` : OUTCOME_TITLES[this.outcome];
  }

  subtitle() {
    const { level, names, score } = this.summary;
    if (this.outcome === 'next') {
      const { name, barrio } = RIVALS[level + 1];
      return `PRÓXIMO RIVAL: ${name} · de ${barrio}`;
    }
    if (this.outcome === 'champion') return `Venciste a los ${RIVALS.length} papagayeros de Caracas`;
    if (this.outcome === 'defeat') return `${names[1]} se queda con el cielo`;
    return `${score[0]} - ${score[1]}`;
  }

  /** CORTES / CHOQUES / JALONES / PUNTOS for both players. */
  addStats() {
    const { names, stats, score } = this.summary;
    const rows = [...STAT_ROWS.map(([title, key]) => [title, stats.map((player) => player[key])]), ['PUNTOS', score]];
    panel(this, 190, STATS_Y - 12, 420, 148);
    STAT_COLUMNS.forEach((x, player) => label(this, x, STATS_Y + 8, names[player], 16, PLAYER_COLORS[player]));
    rows.forEach(([title, values], i) => {
      const y = STATS_Y + 38 + i * 24;
      label(this, W / 2, y, title, 13, DIM);
      STAT_COLUMNS.forEach((x, player) => label(this, x, y, String(values[player]), 18));
    });
  }

  /** Loads the board once; a qualifying total is announced and routed to the initials screen. */
  checkRecord(total) {
    this.next = Leaderboard.load().then((entries) => {
      const qualifies = Leaderboard.qualifies(entries, total);
      if (qualifies && !this.leaving) label(this, W / 2, 404, '¡NUEVO RÉCORD!', 22, PLAYER_COLORS[0]);
      return qualifies ? 'Initials' : 'Title';
    });
  }

  leave(key, data) {
    this.leaving = true;
    this.scene.start(key, data);
  }

  proceed() {
    const { level, total, choices } = this.summary;
    if (this.outcome === 'next') {
      this.leave('Intro', { level: level + 1, total, choices });
      return;
    }
    this.leaving = true;
    this.next.then((key) => this.scene.start(key, { score: total, choices }));
  }

  /** Walking away abandons the ladder or the rematch, but a finished solo run still gets its initials. */
  timeout() {
    if (this.outcome === 'next' || this.outcome === 'versus') this.leave('Title');
    else this.proceed();
  }

  step(presses) {
    if (this.leaving) return;
    for (const code of presses) {
      if (this.leaving) break;
      if (this.menu) this.menu.handle(code);
      else if (MENU_CODES.confirm.includes(code)) this.proceed();
    }
    if (!this.leaving && this.idle > RESULT_IDLE_MS) this.timeout();
  }
}

const INITIALS_LENGTH = 3;
const INITIALS_IDLE_MS = 30000;
const BOARD_SHOW_MS = 4500;
const LETTER_GAP = 76;
const LETTERS_Y = 250;

/** Three-letter initials for a qualifying solo total; then its rank shows on the board. */
class InitialsScene extends BackdropScene {
  constructor() {
    super('Initials');
  }

  init({ score, choices = DEFAULT_CHOICES }) {
    Object.assign(this, { score, choices, letters: Array(INITIALS_LENGTH).fill('A'), cursor: 0, done: false });
  }

  create() {
    this.stage(0.5, looksFor('versus', 0, this.choices), ['win', null]);
    shine(label(this, W / 2, 96, '¡NUEVO RÉCORD!', 52), PLAYER_COLORS[0]);
    label(this, W / 2, 150, `PUNTOS ${this.score}`, 24, GOLD);
    this.slots = this.letters.map((letter, i) => label(this, W / 2 + (i - 1) * LETTER_GAP, LETTERS_Y, letter, 60));
    this.caret = this.add.rectangle(0, LETTERS_Y + 44, 54, 7, GOLD);
    addPanel(this);
    this.help = this.add.container(0, 0, [
      label(this, W / 2, BOARD.y + 30, 'ESCRIBE TUS INICIALES', 18, GOLD),
      label(this, W / 2, BOARD.y + 64, 'JOYSTICK: LETRA Y POSICIÓN', 12),
      label(this, W / 2, BOARD.y + 90, 'B1 / START: SIGUIENTE', 12, DIM),
    ]);
    this.refresh();
  }

  step(presses) {
    if (this.done) return;
    presses.forEach((code) => this.handle(code));
    if (!this.done && this.idle > INITIALS_IDLE_MS) this.submit();
  }

  handle(code) {
    if (this.done) return;
    if (MENU_CODES.up.includes(code)) this.shift(1);
    else if (MENU_CODES.down.includes(code)) this.shift(-1);
    else if (MENU_CODES.left.includes(code)) this.move(-1);
    else if (MENU_CODES.right.includes(code)) this.move(1);
    else if (MENU_CODES.confirm.includes(code)) this.advance();
    this.refresh();
  }

  shift(step) {
    this.letters[this.cursor] = shiftLetter(this.letters[this.cursor], step);
  }

  move(step) {
    this.cursor = Phaser.Math.Clamp(this.cursor + step, 0, INITIALS_LENGTH - 1);
  }

  advance() {
    if (this.cursor < INITIALS_LENGTH - 1) this.cursor += 1;
    else this.submit();
  }

  refresh() {
    this.slots.forEach((slot, i) => slot.setText(this.letters[i]).setColor(css(i === this.cursor ? GOLD : CREAM)));
    this.caret.setX(this.slots[this.cursor].x).setVisible(!this.done);
  }

  async submit() {
    this.done = true;
    this.refresh();
    const { entries, rank } = await Leaderboard.record({ name: this.letters.join(''), score: this.score });
    this.help.setVisible(false);
    addBoard(this).fill(entries, rank);
    this.time.delayedCall(BOARD_SHOW_MS, () => this.scene.start('Title'));
  }
}

// ---------------------------------------------------------------------------
// 18. Boot
// ---------------------------------------------------------------------------

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: css(INK),
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, BuildScene, IntroScene, DuelScene, ResultScene, InitialsScene],
});
})();
