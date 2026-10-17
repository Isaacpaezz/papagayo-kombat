// ¡Papagayos! — Platanus Hack 26 Caracas Edition
// Kite duel over Caracas: sweep your tail's blade across the rival's string to cut it.

// The whole game lives in one function scope (left unindented) so the minifier can shorten every name.
(() => {

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const W = 800;
const H = 600;
const TAU = Math.PI * 2;
const FONT = '"Arial Black", "Arial Bold", Arial, sans-serif';

const COLORS = {
  ink: 0x161029,
  sun: 0xffc04d,
  cream: 0xfff3d6,
  dim: 0xb7a6d8,
  danger: 0xff3b4e,
  players: [0xffd23f, 0x3fd2ff],
};

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
}));

const MENU_CODES = {
  up: ['P1_U', 'P2_U'],
  down: ['P1_D', 'P2_D'],
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

// Backends in priority order. Any of them may be missing or throw: the production
// iframe is sandboxed without same-origin, so even touching localStorage can fail.
const bridgeBackend = {
  async get(key) {
    const { found, value } = await window.platanusArcadeStorage.get(key);
    return found ? value : null;
  },
  set: (key, value) => window.platanusArcadeStorage.set(key, value),
};

const localBackend = {
  get(key) {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  },
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
  { name: 'AVI', score: 900 },
  { name: 'PET', score: 700 },
  { name: 'CAT', score: 500 },
  { name: 'PAS', score: 300 },
  { name: 'VAL', score: 150 },
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
const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng());

const between = (rng, [low, high]) => low + rng() * (high - low);

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const lerp = (a, b, t) => a + (b - a) * t;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector of a stick or velocity; zero stays zero. */
const unit = (x, y) => {
  const length = Math.hypot(x, y) || 1;
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
const KITE = { radius: 25, drag: 2.4, aero: 800, climb: 0.6, lean: 0.25, slackAero: 0.75, gravity: 460, gust: 150 };
const TAUT_SLACK = 4;
// JALAR: a burst along the stick plus a tug upward on the line.
const DASH = { burst: 240, lift: 40, cooldown: 1.3 };
const STUN = 0.6;
const IDLE_INPUT = { ax: 0, ay: 0, dash: false, reel: false };
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
    dashCooldown: 0,
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
  if (reel) kite.len = Math.max(STRING.min, kite.len - STRING.reel * dt);
  else if (kite.len < reach) kite.len = Math.min(reach, kite.len + STRING.payout * dt);
};

/** Direction of the wind's push: up (leaning to the centre) bent by the stick. */
const aeroDirection = (kite, { ax, ay }, lean) => {
  const [sx, sy] = unit(ax, ay);
  const inward = Math.sign(W / 2 - kite.anchor.x);
  return unit(Math.sin(lean) * inward * KITE.climb + sx, -Math.cos(lean) * KITE.climb + sy);
};

/** A taut line turns the wind into a full push; a slack or cut kite catches only part of it. */
const accelerate = (kite, input, weather, dt) => {
  const [dx, dy] = aeroDirection(kite, input, weather.lean);
  const push = KITE.aero * weather.wind * (kite.taut && !kite.free ? 1 : KITE.slackAero);
  kite.vx += (dx * push + weather.gust) * dt;
  kite.vy += (dy * push + KITE.gravity) * dt;
};

/** JALAR: a burst along the stick (none when centred) plus an upward tug that fights a calm. */
const dash = (kite, { ax, ay }) => {
  const [sx, sy] = unit(ax, ay);
  kite.vx += sx * DASH.burst;
  kite.vy += sy * DASH.burst - DASH.lift;
  kite.dashCooldown = DASH.cooldown;
};

const keepOnScreen = (kite) => {
  kite.x = Math.min(W - KITE.radius, Math.max(KITE.radius, kite.x));
  kite.y = Math.max(KITE.radius, kite.y);
};

/** Distance constraint: a taut line projects the kite back onto its circle and cancels outward speed. */
const constrain = (kite) => {
  const dx = kite.x - kite.anchor.x;
  const dy = kite.y - kite.anchor.y;
  const reach = Math.hypot(dx, dy);
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

const flyKite = (kite, input, weather, dt) => {
  const control = kite.stun > 0 || kite.free ? IDLE_INPUT : input;
  if (!kite.free) reelLine(kite, control.reel, weather.reach, dt);
  accelerate(kite, control, weather, dt);
  if (control.dash && kite.dashCooldown === 0) dash(kite, control);
  const damping = Math.exp(-KITE.drag * dt);
  kite.vx *= damping;
  kite.vy *= damping;
  kite.x += kite.vx * dt;
  kite.y += kite.vy * dt;
  if (kite.free) return;
  keepOnScreen(kite);
  constrain(kite);
};

/** Advances one kite by dt; a stuck kite (caught in the wires or on a roof) only sways its tail. */
const stepKite = (kite, input, weather, dt) => {
  kite.dashCooldown = Math.max(0, kite.dashCooldown - dt);
  kite.stun = Math.max(0, kite.stun - dt);
  if (!kite.stuck) flyKite(kite, input, weather, dt);
  stepTail(kite, weather, dt);
};

/** Unit normal of a kite's string (anchor to kite). */
const stringNormal = (kite) => unit(kite.anchor.y - kite.y, kite.x - kite.anchor.x);

/** Speed of a blade point across a string; the string's own motion does not saw. */
const sweepSpeed = (point, rival) => {
  const [nx, ny] = stringNormal(rival);
  return Math.abs(point.vx * nx + point.vy * ny);
};

/** Fastest speed at which the blade of `kite` saws across the string of `rival`; 0 when it is not sawing. */
const sawSpeed = (kite, rival) => {
  if (rival.free) return 0;
  const speeds = kite.tail.slice(TAIL.bladeFrom, TAIL.segments).map((point, i) => {
    const crosses = segmentsIntersect(point, kite.tail[TAIL.bladeFrom + i + 1], rival.anchor, rival);
    return crosses ? sweepSpeed(point, rival) : 0;
  });
  const fastest = Math.max(...speeds);
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
const WIND = { cycle: TAU / 10, flutter: 0.12, flutterRate: 1.7, gustRate: 0.45, lull: 0.55, rafaga: 1.45, lead: 1.2, opening: 0.3 };
const WEATHER = {
  calm: { wind: 1, swing: 0.85, lean: 1, gust: 1, reach: STRING.base },
  ventarron: { wind: 1.3, swing: 0.6, lean: 2, gust: 1.8, reach: STRING.max },
};

const powerLineY = (x) => {
  const t = (x - POWER_LINE.from) / (POWER_LINE.to - POWER_LINE.from);
  return POWER_LINE.y + POWER_LINE.sag * 4 * t * (1 - t);
};

/** 'line' when the kite touches the wires, 'ground' when it sinks onto the rooftops. */
const crashCause = ({ x, y }) => {
  const overStreet = x >= POWER_LINE.from && x <= POWER_LINE.to;
  if (overStreet && Math.abs(y - powerLineY(x)) < KITE.radius + POWER_LINE.half) return 'line';
  if (y + KITE.radius > ROOF_Y) return 'ground';
  return null;
};

/** Weather at round time `at`: deterministic, so the screen can warn about what comes next. */
const weatherAt = (duel, at = duel.elapsed) => {
  const storm = at >= ROUND.ventarron ? WEATHER.ventarron : WEATHER.calm;
  const [cycle, flutter, side] = duel.windPhases;
  const wind =
    storm.wind + storm.swing * Math.sin(at * WIND.cycle + cycle) + WIND.flutter * Math.sin(at * WIND.flutterRate + flutter);
  return {
    wind: Math.max(0, wind),
    gust: KITE.gust * storm.gust * Math.sin(at * WIND.gustRate + side),
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

const createDuel = (rng) => startRound({ rng, score: [0, 0], round: 0, winner: null });

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

const advanceWorld = (duel, inputs, dt) => {
  const weather = weatherAt(duel);
  duel.kites.forEach((kite, player) => stepKite(kite, inputs[player], weather, dt));
  duel.zamuros.forEach((zamuro) => {
    zamuro.x += zamuro.vx * dt;
  });
  duel.zamuros = duel.zamuros.filter(({ x }) => x > -ZAMURO.margin - 1 && x < W + ZAMURO.margin + 1);
};

/** Wears each string by the rival blade's travel across it, or lets it recover; returns which snapped. */
const frayStrings = (duel, dt) => {
  const { kites } = duel;
  const speeds = kites.map((kite, i) => (duel.grace > 0 ? 0 : sawSpeed(kite, kites[1 - i])));
  return kites.map((kite, i) => {
    const speed = speeds[1 - i];
    kite.fray = speed ? kite.fray + speed * dt : Math.max(0, kite.fray - FRAY.recovery * dt);
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
  duel.grace = Math.max(0, duel.grace - dt);
  spawnZamuros(duel, dt);
  advanceWorld(duel, inputs, dt);
  const events = stunKites(duel);
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
    advanceWorld(duel, inputs, dt * ROUND.slowmo);
    duel.clock -= dt;
    return duel.clock > 0 ? [] : endRound(duel);
  },
  over: () => [],
};

/** Advances the duel by dt with one input per player and returns what happened. */
const stepDuel = (duel, inputs, dt) => PHASES[duel.phase](duel, inputs, dt);

// ---------------------------------------------------------------------------
// 7. CPU rival (pure)
// ---------------------------------------------------------------------------

// reaction: seconds between decisions; aim: target noise (px); dashRange: px from target to JALAR;
// guard: chance to retreat when a blade threatens its string; nerve: how low (y) it sinks before
// climbing; foresight: chance to heed the CALMA warning instead of waiting for the calm itself;
// aggression: chance to go sawing on each decision instead of holding high above its anchor;
// stroke: how far past the rival string each saw stroke reaches (short strokes barely fray it);
// pace: share of frames it pushes the stick outside a climb (a slow kite rarely saws fast enough to cut).
const RIVALS = [
  // A careful beginner: climbs out of calms in time, but dawdles and hovers instead of sawing.
  { name: 'EL CHAMO', barrio: 'Catia', reaction: 0.75, aim: 100, dashRange: 0, guard: 0, nerve: 390, foresight: 0.7, aggression: 0.6, stroke: 0, pace: 0.37 },
  { name: 'LA FLACA', barrio: 'Petare', reaction: 0.38, aim: 40, dashRange: 70, guard: 0.3, nerve: 420, foresight: 0.4, aggression: 0.8, stroke: 50, pace: 1 },
  { name: 'EL CATIRE', barrio: 'La Pastora', reaction: 0.27, aim: 34, dashRange: 90, guard: 0.45, nerve: 400, foresight: 0.6, aggression: 0.85, stroke: 50, pace: 1 },
  { name: 'DON GOYO', barrio: 'El Valle', reaction: 0.15, aim: 12, dashRange: 110, guard: 0.8, nerve: 380, foresight: 0.9, aggression: 1, stroke: 50, pace: 1 },
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
  if (cpu.climbing) {
    Object.assign(cpu, { target: { x: me.x, y: 0 }, reel: false, dash: true });
    return;
  }
  cpu.reel = threatened(me, rival) && rng() < spec.guard;
  const attacks = !cpu.reel && rng() < spec.aggression;
  const aim = attacks ? sawPoint(me, rival, spec.stroke) : retreatPoint(me);
  cpu.target = {
    x: aim.x + gaussian(rng) * spec.aim,
    y: Math.min(CPU.floor, aim.y + gaussian(rng) * spec.aim),
  };
  cpu.dash = distance(me, cpu.target) < spec.dashRange;
};

const axis = (delta) => (Math.abs(delta) < CPU.deadzone ? 0 : Math.sign(delta));

/** Digital joystick and buttons for the CPU player; a planned JALAR fires once, when the meter is full. */
const cpuInput = (cpu, duel, dt) => {
  const me = duel.kites[cpu.player];
  cpu.think -= dt;
  if (cpu.think <= 0) plan(cpu, duel);
  const dashNow = cpu.dash && me.dashCooldown === 0;
  if (dashNow) cpu.dash = false;
  // Slow rivals dawdle while attacking but never while climbing; only they draw from the rng here,
  // so faster ones keep their exact decision sequence.
  const coasting = !cpu.climbing && cpu.spec.pace < 1 && cpu.rng() > cpu.spec.pace;
  return {
    ax: coasting ? 0 : axis(cpu.target.x - me.x),
    ay: coasting ? 0 : axis(cpu.target.y - me.y),
    dash: dashNow,
    reel: cpu.reel,
  };
};

// ---------------------------------------------------------------------------
// 8. Art direction (pure)
// ---------------------------------------------------------------------------

const ART = {
  ink: 0x1a0f22,
  silhouette: 0x24152b,
  rim: 0xffa25e,
  stick: 0x4a2c18,
  steel: 0xe8eef7,
  wire: 0x150c13,
  haze: 0x7a3a5a,
  zamuro: 0x17111a,
  zamuroTip: 0xcfc6bd,
  windows: [0xffd27a, 0xffe6a8, 0xfff2d6, 0x9fd0ff],
};
// Two-tone paper per player; the first colour is also the player's HUD colour.
const KITE_COLORS = [
  [0xffd23f, 0xe8432e],
  [0x3fd2ff, 0xe83e9b],
];
const RANCHOS = [0xc0603e, 0xd27d4e, 0xe0a273, 0xa65f80, 0xe6b98d, 0x86609a, 0xd9c27a];
const PAPELITOS = [0xff5d8f, 0x5de0ff, 0xffe066, 0x9dff7a, 0xfff3d6];
const CLOTHES = [0xf2e6c9, 0x6fa8dc, 0xe06666];

// Sky stops (top to horizon) for golden hour, dusk and the first night: the match walks through them.
const SKIES = [
  [0x2b1640, 0x7a2f5b, 0xe2683c, 0xffb347],
  [0x1c1238, 0x4a1f5c, 0xa63a55, 0xef7b45],
  [0x060a1d, 0x111a3c, 0x2b2453, 0x683453],
];
// Night falls on the fifth round; ease is how fast the light follows a new round (1/s).
const DAY = { rounds: 4, ease: 0.7 };
const NIGHT_TINT = 0x5a5f9a;
const CLOUD_NIGHT = 0x3a3f70;
// Visible breeze (px/s): papelitos race in a gust, drift and sink in a calm.
const BREEZE = { speed: 120, gust: 0.6, sink: 60 };
const SAG = { taut: 3, slack: 0.6, max: 90 };

/** Linear blend of two 0xRRGGBB colours. */
const mixColor = (from, to, t) => {
  const channel = (shift) => {
    const a = (from >> shift) & 0xff;
    return Math.round(a + (((to >> shift) & 0xff) - a) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
};

/** Time of day of a round: 0 is golden hour, 1 the first night. */
const dayPhase = (round) => Math.min(1, round / DAY.rounds);

/** Opacity of each baked sky, stacked in order so they crossfade golden → dusk → night. */
const skyAlphas = (t) => SKIES.map((_, i) => clamp01(t * (SKIES.length - 1) - i + 1));

/** City windows switch on in waves as night falls. */
const lightsAlpha = (t, wave) => clamp01((t - 0.3 - wave * 0.18) / 0.2);

/** How the wind looks (px/s) on papelitos, clothes, clouds and the flag. */
const windDrift = ({ wind, gust }) => ({ vx: wind * (BREEZE.speed + gust * BREEZE.gust), vy: BREEZE.sink * (1 - wind) });

/** Belly of a string at its middle (px): nearly straight when taut, loose when slack. */
const stringSag = (kite) =>
  kite.taut ? SAG.taut : Math.min(SAG.max, SAG.taut + (kite.len - distance(kite, kite.anchor)) * SAG.slack);

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
  const cos = Math.cos(angle) * scale;
  const sin = Math.sin(angle) * scale;
  return points.map(([px, py]) => ({ x: x + px * cos - py * sin, y: y + px * sin + py * cos }));
};

/** Who is celebrating after a point: 'win', 'lose' or null. */
const moodOf = (verdict, player) => {
  if (!verdict || verdict.winner === null) return null;
  return verdict.winner === player ? 'win' : 'lose';
};

// ---------------------------------------------------------------------------
// 9. Painters (procedural, baked once into canvas textures)
// ---------------------------------------------------------------------------

// Background layers are wider than the screen so they can slide for parallax.
const PARALLAX = 40;
const WIDE = W + 2 * PARALLAX;
const SUN = { x: 150, rise: 240, set: 450, size: 320 };
const RAYS = { size: 900, count: 16 };
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
const TOWERS = [318, 352];
const TOWER_TOP = 336;
const BARRIO = { reach: 330, rise: 150, foot: 480, ranchos: 170 };
// Window panes [width, height, gap x, gap y, ink alpha, chance to light up] for far and near buildings.
const PANE_FAR = [2, 2, 5, 6, 0.3, 0.3];
const PANE_NEAR = [6, 7, 12, 14, 0.55, 0.22];
const LIGHT_WAVES = 3;
const POLE = { top: 446, bar: 54 };
const CABLES = [-7, 0, 7];
const AZOTEA = { half: 80, tank: 48, antenna: 66, posts: [24, 70], lineY: ROOF_Y - 30 };
const SPRITES = { glow: 128, spark: 16, glint: 40 };

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

const tracePath = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
};

const paintSky = (stops, stars) => (ctx, rng) => {
  ctx.fillStyle = linear(ctx, 0, 0, 0, 470, stops.map((color) => [color]));
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < stars; i += 1) {
    ctx.fillStyle = rgba(0xffffff, 0.2 + rng() * 0.7);
    ctx.fillRect(rng() * W, rng() * 320, 1.5, 1.5);
  }
};

const paintSun = (ctx) => {
  const r = SUN.size / 2;
  ctx.fillStyle = radial(ctx, r, r, r, [
    [0xfffbe8, 1, 0],
    [0xffe6a0, 1, 0.1],
    [0xffb050, 0.45, 0.17],
    [0xff7a40, 0.15, 0.45],
    [0xff5a30, 0, 1],
  ]);
  ctx.fillRect(0, 0, SUN.size, SUN.size);
};

/** Faint god rays: thin wedges fanning out of the sun. */
const paintRays = (ctx, rng) => {
  const r = RAYS.size / 2;
  ctx.fillStyle = radial(ctx, r, r, r, [
    [0xffd9a0, 0.2, 0],
    [0xffb070, 0, 1],
  ]);
  for (let i = 0; i < RAYS.count; i += 1) {
    const angle = rng() * TAU;
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.arc(r, r, r, angle, angle + 0.03 + rng() * 0.06);
    ctx.fill();
  }
};

/** Soft cloud clusters, pink on top and lit orange underneath; drawn three times so the layer tiles. */
const paintClouds = ({ count, top, bottom, size, alpha, flat }) => (ctx, rng) => {
  ctx.filter = 'blur(3px)';
  for (let i = 0; i < count; i += 1) {
    const cx = rng() * W;
    const cy = between(rng, [top, bottom]);
    const width = size * (0.6 + rng());
    const puffs = Array.from({ length: 7 }, () => [
      cx + (rng() - 0.5) * width,
      cy + (rng() - 0.5) * width * 0.15,
      width * (0.1 + rng() * 0.12),
    ]);
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
  ctx.fillStyle = rgba(mixColor(color, ART.ink, 0.35));
  ctx.fillRect(x - 6, y - 26, 12, 28);
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
  ctx.strokeStyle = rgba(ART.rim, 0.35);
  ctx.lineWidth = 1.5;
  tracePath(ctx, crest);
  ctx.stroke();
  if (hotel) paintHumboldt(ctx, crest.reduce((high, point) => (point[1] < high[1] ? point : high)), top);
};

/** A block with a sunset rim on its roof edge and a grid of panes; some panes will light up at night. */
const paintBuilding = (ctx, rng, windows, x, y, width, color, [paneW, paneH, gapX, gapY, ink, lit] = PANE_NEAR) => {
  ctx.fillStyle = rgba(color);
  ctx.fillRect(x, y, width, H - y);
  ctx.fillStyle = rgba(ART.rim, 0.5);
  ctx.fillRect(x, y, width, 1.5);
  ctx.fillStyle = rgba(ART.ink, ink);
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
  const hill = (x) => BARRIO.foot - BARRIO.rise * Math.max(0, 1 - Math.abs(x - edge) / BARRIO.reach) ** 1.4;
  const ground = Array.from({ length: 35 }, (_, i) => edge + inward * i * 10);
  ctx.fillStyle = rgba(0x3a2240);
  tracePath(ctx, [...ground.map((x) => [x, hill(x) - 4]), [ground[34], H], [edge, H]]);
  ctx.fill();
  const ranchos = Array.from({ length: BARRIO.ranchos }, () => {
    const x = edge + inward * rng() * BARRIO.reach * 0.95;
    const color = RANCHOS[Math.floor(rng() * RANCHOS.length)];
    return { x, y: between(rng, [hill(x), BARRIO.foot]), w: 9 + rng() * 9, h: 7 + rng() * 6, color, lit: rng() < 0.6 };
  }).sort((a, b) => a.y - b.y);
  ranchos.forEach(({ x, y, w, h, color, lit }) => {
    const shade = mixColor(color, ART.haze, 0.25 + 0.4 * clamp01((BARRIO.foot - y) / BARRIO.rise));
    ctx.fillStyle = rgba(shade);
    ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = rgba(mixColor(shade, ART.ink, 0.45));
    ctx.fillRect(x - 1, y - h - 2, w + 2, 2);
    const pane = { x: x + w * 0.3, y: y - h * 0.65, w: 2, h: 2 };
    ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
    if (lit) windows.push(pane);
  });
};

/** Mid-distance skyline with the twin Parque Central towers, framed by the barrios. */
const paintCity = (windows) => (ctx, rng) => {
  for (let x = 170; x < 720; x += 18 + rng() * 18) {
    paintBuilding(ctx, rng, windows, x, 405 + rng() * 45, 16 + rng() * 14, mixColor(0x2a1d3e, ART.haze, 0.25), PANE_FAR);
  }
  const tower = mixColor(0x261a3a, ART.haze, 0.3);
  TOWERS.forEach((x) => {
    paintBuilding(ctx, rng, windows, x, TOWER_TOP, 22, tower, PANE_FAR);
    ctx.fillStyle = rgba(tower);
    ctx.fillRect(x - 2, TOWER_TOP - 6, 26, 7);
    ctx.fillRect(x + 10, TOWER_TOP - 20, 2, 16);
  });
  [0, 1].forEach((side) => paintBarrio(ctx, rng, windows, side));
};

/** Glowing panes for one wave of windows (every `waves`-th pane), blended additively at night. */
const paintLights = (windows, wave, waves = LIGHT_WAVES) => (ctx) => {
  ctx.shadowBlur = 8;
  windows.forEach((pane, i) => {
    if (i % waves !== wave) return;
    ctx.fillStyle = ctx.shadowColor = rgba(ART.windows[i % ART.windows.length]);
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
    ctx.fillStyle = rgba(ART.wire);
    ctx.fillRect(x - 4, POLE.top, 8, H);
    ctx.fillRect(x - POLE.bar / 2, POLE.top + 6, POLE.bar, 5);
    ctx.fillStyle = rgba(0x9a8f9a);
    CABLES.forEach((offset) => ctx.fillRect(x - 2, powerLineY(x) + offset - 5, 4, 6));
  });
  ctx.fillStyle = rgba(ART.wire);
  ctx.fillRect(POWER_LINE.from - 18, POLE.top + 26, 13, 20);
  CABLES.forEach((offset) => {
    ctx.strokeStyle = rgba(ART.wire);
    ctx.lineWidth = 2;
    tracePath(ctx, cablePath(offset));
    ctx.stroke();
    ctx.strokeStyle = linear(ctx, POWER_LINE.from, 0, POWER_LINE.to, 0, [[ART.rim, 0], [0xffe0b0, 0.6], [ART.rim, 0]]);
    ctx.lineWidth = 1;
    tracePath(ctx, cablePath(offset - 1));
    ctx.stroke();
  });
};

/** A blue water tank on legs, as on every Caracas rooftop. */
const paintTank = (ctx, x) => {
  ctx.fillStyle = rgba(ART.silhouette);
  ctx.fillRect(x - 11, ROOF_Y - 14, 3, 14);
  ctx.fillRect(x + 8, ROOF_Y - 14, 3, 14);
  ctx.fillStyle = linear(ctx, x - 14, 0, x + 14, 0, [[0x1d3d6e], [0x3d79c0], [0x1d3d6e]]);
  ctx.fillRect(x - 14, ROOF_Y - 38, 28, 26);
  ctx.fillStyle = rgba(ART.rim, 0.7);
  ctx.fillRect(x - 14, ROOF_Y - 40, 28, 3);
};

const paintAntenna = (ctx, x) => {
  ctx.fillStyle = rgba(ART.silhouette);
  ctx.fillRect(x - 1, ROOF_Y - 58, 2, 58);
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
    const outward = player === 0 ? -1 : 1;
    paintBuilding(ctx, rng, windows, x - AZOTEA.half, ROOF_Y, AZOTEA.half * 2, 0x3b2234);
    ctx.fillStyle = rgba(0x4d2c3c);
    ctx.fillRect(x - AZOTEA.half - 4, ROOF_Y - 6, AZOTEA.half * 2 + 8, 8);
    ctx.fillStyle = rgba(ART.rim, 0.8);
    ctx.fillRect(x - AZOTEA.half - 4, ROOF_Y - 6, AZOTEA.half * 2 + 8, 2);
    paintTank(ctx, x + outward * AZOTEA.tank);
    paintAntenna(ctx, x + outward * AZOTEA.antenna);
    ctx.fillStyle = rgba(ART.silhouette);
    AZOTEA.posts.forEach((offset) => ctx.fillRect(x - outward * offset - 1, AZOTEA.lineY, 2, ROOF_Y - AZOTEA.lineY));
  });
};

/** Soft white dot; tinted and blended additively it becomes a glow or a spark. */
const paintDot = (size) => (ctx) => {
  const r = size / 2;
  ctx.fillStyle = radial(ctx, r, r, r, [
    [0xffffff, 1, 0],
    [0xffffff, 0.35, 0.35],
    [0xffffff, 0, 1],
  ]);
  ctx.fillRect(0, 0, size, size);
};

/** Four-point star for the glint on a blade. */
const paintGlint = (ctx) => {
  const size = SPRITES.glint;
  paintDot(size / 2)(ctx);
  ctx.fillStyle = linear(ctx, 0, 0, size, 0, [[0xffffff, 0], [0xffffff, 1], [0xffffff, 0]]);
  ctx.fillRect(0, size / 2 - 0.5, size, 1);
  ctx.fillStyle = linear(ctx, 0, 0, 0, size, [[0xffffff, 0], [0xffffff, 1], [0xffffff, 0]]);
  ctx.fillRect(size / 2 - 0.5, 0, 1, size);
};

// ---------------------------------------------------------------------------
// 10. Backdrop (parallax layers)
// ---------------------------------------------------------------------------

const ADD = () => Phaser.BlendModes.ADD;

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
    this.rays = scene.add.image(SUN.x, SUN.rise, bake(scene, 'rays', RAYS.size, RAYS.size, paintRays));
    this.sun = scene.add.image(SUN.x, SUN.rise, bake(scene, 'sun', SUN.size, SUN.size, paintSun));
    [this.rays, this.sun].forEach((glow) => glow.setBlendMode(ADD()));
    this.addClouds(scene, 0);
    const ridge = (i) => layer(bake(scene, `ridge-${i}`, WIDE, H, paintRidge(RIDGES[i])), RIDGES[i].depth);
    this.tinted = [ridge(0), ridge(1)];
    this.addClouds(scene, 1);
    const windows = [];
    this.tinted.push(ridge(2), layer(bake(scene, 'city', WIDE, H, paintCity(windows)), CITY_DEPTH));
    this.glowingWindows = Array.from({ length: LIGHT_WAVES }, (_, wave) =>
      layer(bake(scene, `lights-${wave}`, WIDE, H, paintLights(windows, wave)), CITY_DEPTH).setBlendMode(ADD()),
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
    this.glowingWindows.push(add(bake(scene, 'azotea-lights', W, H, paintLights(windows, 0, 1))).setBlendMode(ADD()));
  }

  update(day, drift, dt, focusX) {
    const sunset = clamp01(day / 0.7);
    const sunY = lerp(SUN.rise, SUN.set, sunset);
    skyAlphas(day).forEach((alpha, i) => this.skies[i].setAlpha(alpha));
    this.sun.setY(sunY).setAlpha(1 - sunset * 0.5);
    this.rays.setY(sunY).setAlpha(0.8 * (1 - sunset)).setRotation(this.rays.rotation + dt * 0.02);
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
// 11. Actors: wind, zamuros, kids, kites
// ---------------------------------------------------------------------------

// Particles turn into streaks exactly when the wind reaches the ¡RÁFAGA! threshold.
const WIND_PARTICLES = { count: 70, top: 20, bottom: 520, streak: BREEZE.speed * WIND.rafaga, trace: 0.06 };
const PAPELITO = [[-3, -2], [3, -2], [3, 2], [-3, 2]];
const LEAF = [[0, -4], [2, 0], [0, 4], [-2, 0]];

/** Papelitos, leaves and dust that make the wind visible: they streak in gusts and flutter down in calms. */
class WindParticles {
  constructor() {
    const rng = makeRng(7);
    this.items = Array.from({ length: WIND_PARTICLES.count }, () => ({
      x: rng() * W,
      y: between(rng, [WIND_PARTICLES.top, WIND_PARTICLES.bottom]),
      pace: 0.6 + rng() * 0.8,
      spin: rng() * TAU,
      kind: Math.floor(rng() * 3),
      color: PAPELITOS[Math.floor(rng() * PAPELITOS.length)],
    }));
  }

  update(drift, dt) {
    const { top, bottom } = WIND_PARTICLES;
    for (const item of this.items) {
      item.spin += dt * (2 + Math.abs(drift.vx) * 0.02);
      item.x = ((item.x + drift.vx * item.pace * dt + W + 80) % (W + 80)) - 40;
      item.y += (drift.vy * item.pace + Math.sin(item.spin) * 14) * dt;
      if (item.y > bottom) item.y = top;
      if (item.y < top) item.y = bottom;
    }
  }

  draw(g, drift) {
    const streaks = Math.hypot(drift.vx, drift.vy) > WIND_PARTICLES.streak;
    this.items.forEach(({ x, y, pace, spin, kind, color }) => {
      if (streaks) {
        const trace = WIND_PARTICLES.trace * pace;
        g.lineStyle(1.5, COLORS.cream, 0.5).lineBetween(x, y, x - drift.vx * trace, y - drift.vy * trace);
      } else if (kind === 0) {
        g.fillStyle(ART.rim, 0.5).fillCircle(x, y, 1.3);
      } else {
        g.fillStyle(kind === 1 ? color : 0x8a8f3a, 0.8).fillPoints(posed(kind === 1 ? PAPELITO : LEAF, x, y, spin, pace * 1.2), true);
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
  g.fillStyle(ART.zamuro);
  [-1, 1].forEach((side) => {
    g.fillTriangle(x, y - 3 * scale, x + side * span, tipY, x + side * 5 * scale, y + 4 * scale);
    g.fillStyle(ART.zamuroTip, 0.8).fillTriangle(x + side * span, tipY, x + side * (span - 6 * scale), tipY - 2 * scale, x + side * (span - 5 * scale), tipY + 3 * scale);
    g.fillStyle(ART.zamuro);
  });
  g.fillEllipse(x, y + scale, 16 * scale, 8 * scale);
};

class Birds {
  constructor() {
    this.reset();
  }

  reset() {
    this.flock = PERCHES.map((x) => ({ x, y: powerLineY(x) + CABLES[0] - 7, vx: 0, vy: 0, flying: false }));
    this.seen = 0;
  }

  launch(bird, direction) {
    if (bird && !bird.flying) Object.assign(bird, { flying: true, vx: direction * TAKEOFF.vx, vy: TAKEOFF.vy });
  }

  scatter() {
    this.flock.forEach((bird) => this.launch(bird, bird.x < W / 2 ? -1 : 1));
  }

  update(zamuros, dt) {
    if (zamuros.length > this.seen) {
      const incoming = zamuros[zamuros.length - 1];
      this.launch(this.flock.find((bird) => !bird.flying), -Math.sign(incoming.vx));
    }
    this.seen = zamuros.length;
    this.flock.forEach((bird) => {
      if (!bird.flying) return;
      bird.vy += TAKEOFF.climb * dt;
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
    });
  }

  draw(g, clock) {
    this.flock.forEach(({ x, y, flying }, i) => {
      if (flying) {
        drawVulture(g, x, y, Math.sin(clock * 14 + i), 0.7);
        return;
      }
      const bob = Math.sin(clock * 2 + i * 1.3);
      g.fillStyle(ART.zamuro).fillEllipse(x, y, 9, 13);
      g.fillStyle(0x6b5f60).fillCircle(x + (i % 2 ? 3 : -3), y - 7 + bob, 2.5);
    });
  }
}

/** Clothes on the line of an azotea, swinging with the wind. */
const drawClothes = (g, anchorX, outward, drift, clock) => {
  const [near, far] = AZOTEA.posts.map((offset) => anchorX - outward * offset);
  const y = AZOTEA.lineY;
  const swing = drift.vx * 0.05;
  g.lineStyle(1, COLORS.cream, 0.5).lineBetween(near, y, far, y + 1);
  CLOTHES.forEach((color, i) => {
    const x = lerp(near, far, (i + 0.5) / 3.3);
    const width = 9 + (i % 2) * 4;
    const height = 12 + i * 2;
    const sway = swing + Math.sin(clock * 3 + i * 1.7) * (1 + Math.abs(swing) * 0.3);
    const corners = [[x, y], [x + width, y], [x + width + sway, y + height], [x + sway, y + height]];
    g.fillStyle(mixColor(color, ART.silhouette, 0.35)).fillPoints(corners.map(([px, py]) => ({ x: px, y: py })), true);
  });
};

// The kid's silhouette on the azotea; the string hand sits a little in front of the anchor.
const KID = { foot: ROOF_Y, hip: 517, shoulder: 504, head: 495, hand: 508, reach: 9, jump: 12, slump: 4 };
const TRAIL = { time: 0.3, points: 14, width: 14 };
const TUMBLE = 10;
const SPIN_RATE = 18;
const YANK_DECAY = 4;

/** Per-player art state: the kid's animation, the dash trail and the cut kite's tumble. */
class Flyer {
  constructor(player) {
    this.player = player;
    this.side = player === 0 ? 1 : -1;
    this.colors = KITE_COLORS[player];
    this.clock = 0;
    this.reset();
  }

  reset() {
    Object.assign(this, { cooldown: 0, len: 0, fray: 0, yank: 0, reeling: false, spin: 0, lift: 0, mood: null, trail: [], trailTime: 0 });
  }

  /** Follows the kite since the last frame and reports what the speakers should hear. */
  update(kite, mood, dt) {
    this.clock += dt;
    const dashed = kite.dashCooldown > this.cooldown + 0.5;
    const frayed = kite.fray > this.fray + 0.5;
    this.reeling = kite.len < this.len - 0.1;
    Object.assign(this, { cooldown: kite.dashCooldown, len: kite.len, fray: kite.fray, mood });
    this.yank = dashed ? 1 : Math.max(0, this.yank - dt * YANK_DECAY);
    this.lift = mood === 'win' ? Math.abs(Math.sin(this.clock * 9)) * KID.jump : 0;
    if (kite.free) this.spin += dt * TUMBLE;
    this.trailTime = dashed ? TRAIL.time : Math.max(0, this.trailTime - dt);
    if (this.trailTime > 0) this.trail.unshift({ x: kite.x, y: kite.y });
    if (this.trailTime === 0 || this.trail.length > TRAIL.points) this.trail.pop();
    return { dashed, frayed };
  }

  /** The string hand: yanked back on JALAR, winding circles while reeling in. */
  hand(kite) {
    const turn = this.clock * 16;
    const wind = this.reeling ? 3 : 0;
    return {
      x: kite.anchor.x + this.side * (KID.reach - this.yank * 5) + Math.cos(turn) * wind,
      y: KID.hand + this.yank * 8 - this.lift + Math.sin(turn) * wind,
    };
  }
}

/** The kid twice: a warm rim offset toward the sun, then the backlit silhouette on top. */
const drawKid = (g, flyer, kite) => {
  const { side, mood, lift } = flyer;
  const x = kite.anchor.x;
  const slump = mood === 'lose' ? KID.slump : 0;
  const hand = flyer.hand(kite);
  const [rx, ry] = unit(SUN.x - x, SUN.rise - KID.head);
  const shirt = mixColor(flyer.colors[0], ART.silhouette, 0.45);
  [[rx * 1.5, ry * 1.5, ART.rim, ART.rim], [0, 0, ART.silhouette, shirt]].forEach(([dx, dy, skin, cloth]) => {
    const cx = x + dx;
    const top = (y) => y - lift + dy;
    const shoulder = top(KID.shoulder) + slump;
    const free = mood === 'win' ? [cx - side * 7, top(KID.head) - 9] : [cx - side * 4, top(KID.hip) + 2];
    g.lineStyle(3, skin)
      .lineBetween(cx - 3, top(KID.foot), cx - 2, top(KID.hip))
      .lineBetween(cx + 3, top(KID.foot), cx + 2, top(KID.hip));
    g.fillStyle(cloth).fillRoundedRect(cx - 5, shoulder, 10, KID.hip - KID.shoulder + 1 - slump, 3);
    g.fillStyle(skin).fillCircle(cx + side * slump * 0.5, top(KID.head) + slump * 1.5, 6);
    g.lineStyle(3, cloth)
      .lineBetween(cx + side * 3, shoulder + 2, hand.x + dx, hand.y + dy)
      .lineBetween(cx - side * 3, shoulder + 2, ...free);
  });
};

const KITE_POINTS = [[0, -44], [25, -12], [19, 17], [0, 26], [-19, 17], [-25, -12]];
const KITE_HUB = [0, -6];
const PAPER_ALPHA = 0.86;
const BRIDLE = 16;
const FLUTTER = { rate: 9, swing: 0.05, lean: 0.0015 };

/** Traditional papagayo: two-tone translucent paper panels, varillas, a dark outline and a lit edge. */
const drawPapagayo = (g, x, y, angle, scale, [a, b], filled = true) => {
  const corners = posed(KITE_POINTS, x, y, angle, scale);
  const [hub] = posed([KITE_HUB], x, y, angle, scale);
  if (filled) {
    corners.forEach((corner, i) => {
      const next = corners[(i + 1) % corners.length];
      g.fillStyle(i % 2 ? b : a, PAPER_ALPHA).fillTriangle(hub.x, hub.y, corner.x, corner.y, next.x, next.y);
    });
    g.fillStyle(0xffffff, 0.2).fillTriangle(hub.x, hub.y, corners[0].x, corners[0].y, corners[1].x, corners[1].y);
  }
  g.lineStyle(Math.max(1.5, 4 * scale), filled ? ART.ink : COLORS.cream, filled ? 0.9 : 0.5).strokePoints(corners, true);
  if (!filled) return;
  g.lineStyle(2 * scale, ART.stick, 0.9)
    .lineBetween(corners[0].x, corners[0].y, corners[3].x, corners[3].y)
    .lineBetween(corners[5].x, corners[5].y, corners[1].x, corners[1].y);
  g.lineStyle(1.5 * scale, 0xffffff, 0.5).strokePoints(posed(KITE_POINTS, x, y, angle, scale * 0.9), true);
};

const kiteAngle = (kite, flyer) =>
  Math.atan2(kite.y - kite.anchor.y, kite.x - kite.anchor.x) +
  Math.PI / 2 +
  kite.vx * FLUTTER.lean +
  Math.sin(flyer.clock * FLUTTER.rate + flyer.player * 2) * FLUTTER.swing +
  kite.stun * SPIN_RATE +
  flyer.spin;

/** Where the frenillo meets the string, a little in front of the kite toward the kid. */
const bridleKnot = (kite) => {
  const [ux, uy] = unit(kite.anchor.x - kite.x, kite.anchor.y - kite.y);
  return { x: kite.x + ux * BRIDLE, y: kite.y + uy * BRIDLE };
};

/** String from the kid's hand to the bridle: dark under-stroke for contrast, red pulse and fibres when frayed. */
const drawString = (g, flyer, kite) => {
  const curve = sagCurve(flyer.hand(kite), bridleKnot(kite), stringSag(kite));
  const wear = clamp01(kite.fray / FRAY.toughness);
  if (wear > 0) {
    g.lineStyle(3 + wear * 7, COLORS.danger, wear * (0.3 + 0.25 * Math.sin(flyer.clock * 14))).strokePoints(curve);
    for (let k = 0; k < Math.floor(wear * 12); k += 1) {
      const at = curve[3 + ((k * 5) % 8)];
      const angle = k * 2.1 + flyer.clock * 3;
      g.lineStyle(1, 0xffc0b0, 0.8).lineBetween(at.x, at.y, at.x + Math.cos(angle) * 6, at.y + Math.sin(angle) * 6);
    }
  }
  g.lineStyle(3, ART.ink, 0.35).strokePoints(curve);
  g.lineStyle(1.4, mixColor(COLORS.cream, COLORS.danger, wear)).strokePoints(curve);
};

const drawFrenillo = (g, kite, angle) => {
  const knot = bridleKnot(kite);
  const [top, , , bottom] = posed(KITE_POINTS.slice(0, 4), kite.x, kite.y, angle);
  g.lineStyle(1, COLORS.cream, 0.7).lineBetween(knot.x, knot.y, top.x, top.y).lineBetween(knot.x, knot.y, bottom.x, bottom.y);
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
  g.lineStyle(1.5, ART.ink, 0.8).strokePoints(tail.slice(0, TAIL.bladeFrom + 1));
  for (let i = 1; i < TAIL.bladeFrom; i += 1) drawBow(g, tail[i], tail[i - 1], i % 2 ? a : b);
  const blade = tail.slice(TAIL.bladeFrom);
  g.lineStyle(5, ART.ink, 0.85).strokePoints(blade);
  g.lineStyle(2.5, ART.steel).strokePoints(blade);
  g.fillStyle(0xffffff);
  blade.slice(1).forEach((p, i) => {
    const [dx, dy] = unit(p.x - blade[i].x, p.y - blade[i].y);
    const side = i % 2 ? 5 : -5;
    g.fillTriangle(p.x, p.y, p.x - dx * 6, p.y - dy * 6, p.x - dy * side - dx * 2, p.y + dx * side - dy * 2);
  });
};

/** JALAR: a fading whoosh ribbon along the path plus speed lines behind the kite. */
const drawTrail = (g, flyer, kite) => {
  const { trail, trailTime, colors } = flyer;
  trail.slice(1).forEach((point, i) => {
    const fade = 1 - i / TRAIL.points;
    g.lineStyle(TRAIL.width * fade, colors[0], 0.35 * fade).lineBetween(trail[i].x, trail[i].y, point.x, point.y);
  });
  if (trailTime === 0) return;
  const [dx, dy] = unit(-kite.vx, -kite.vy);
  const fade = trailTime / TRAIL.time;
  [-14, 0, 14].forEach((offset, i) => {
    const x = kite.x - dy * offset + dx * 30;
    const y = kite.y + dx * offset + dy * 30;
    g.lineStyle(2, 0xffffff, 0.7 * fade).lineBetween(x, y, x + dx * (30 + i * 10), y + dy * (30 + i * 10));
  });
};

// ---------------------------------------------------------------------------
// 12. Effects & audio
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
    this.rng = makeRng(26);
    this.clear();
  }

  clear() {
    this.ropes = [];
    this.bolts = [];
  }

  /** The cut string splits: the kid keeps one falling piece, the runaway kite trails the other. */
  snap(at, hand, kite) {
    this.sparks.explode(40, at.x, at.y);
    this.ropes.push(makeRope(hand(), at, hand), makeRope(kite, at, () => ({ x: kite.x, y: kite.y })));
  }

  zap(x, y) {
    this.zaps.explode(50, x, y);
    this.bolts.push({ x, y, life: BOLT.life });
  }

  update(dt) {
    this.ropes.forEach((rope) => stepRope(rope, dt));
    this.bolts.forEach((bolt) => (bolt.life -= dt));
    this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
  }

  draw(g) {
    this.ropes.forEach(({ points }) => g.lineStyle(1.4, COLORS.cream, 0.9).strokePoints(points));
    this.bolts.forEach(({ x, y, life }) => {
      for (let branch = 0; branch < BOLT.branches; branch += 1) {
        const path = [{ x, y }];
        let angle = this.rng() * TAU;
        for (let step = 0; step < BOLT.steps; step += 1) {
          angle += (this.rng() - 0.5) * 1.6;
          const last = path[step];
          path.push({ x: last.x + Math.cos(angle) * BOLT.reach, y: last.y + Math.sin(angle) * BOLT.reach });
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

/** Light synthesised SFX over a wind bed; silent without an AudioContext and never needed to play. */
class Sfx {
  constructor(ctx) {
    this.ctx = ctx;
    this.quietUntil = 0;
    if (!ctx) return;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    window.addEventListener('keydown', () => ctx.state === 'suspended' && ctx.resume());
  }

  /** Sends a source through a sweeping filter and a decaying gain to the master bus. */
  play(source, { type = 'bandpass', from = 1000, to = from, gain = 0.5, duration = 0.2, delay = 0 }) {
    const { ctx } = this;
    const start = ctx.currentTime + delay;
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(this.master);
    source.start(start);
    source.stop(start + duration);
  }

  hiss(options) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    this.play(source, options);
  }

  tone(frequency, wave, options) {
    if (!this.ctx) return;
    const source = this.ctx.createOscillator();
    source.type = wave;
    source.frequency.value = frequency;
    this.play(source, { type: 'lowpass', from: 4000, ...options });
  }

  /** Karplus-Strong string: a noise burst recirculated through a one-period averaging delay. */
  pluck(midi, delay) {
    if (!this.ctx) return;
    const rate = this.ctx.sampleRate;
    const period = Math.round(rate / midiToHz(midi));
    const buffer = this.ctx.createBuffer(1, rate, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = i < period ? Math.random() * 2 - 1 : 0.498 * (data[i - period] + data[i - period + 1]);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    this.play(source, { type: 'lowpass', from: 3500, to: 1200, gain: 0.3, duration: 0.9, delay });
  }

  /** Looping filtered noise whose loudness and brightness follow the wind. */
  setWind(level) {
    if (!this.ctx) return;
    if (!this.bed) {
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const amp = this.ctx.createGain();
      Object.assign(source, { buffer: this.noise, loop: true });
      filter.type = 'lowpass';
      amp.gain.value = 0;
      source.connect(filter).connect(amp).connect(this.master);
      source.start();
      this.bed = { filter, amp };
    }
    const now = this.ctx.currentTime;
    this.bed.amp.gain.setTargetAtTime(0.03 + level * 0.06, now, 0.4);
    this.bed.filter.frequency.setTargetAtTime(250 + level * 700, now, 0.4);
  }

  whoosh() {
    this.hiss({ from: 400, to: 2400, gain: 0.35, duration: 0.3 });
  }

  /** Fray scratches fire every frame while a blade saws, so they are spaced out. */
  scratch() {
    if (!this.ctx || this.ctx.currentTime < this.quietUntil) return;
    this.quietUntil = this.ctx.currentTime + SCRATCH_GAP;
    this.hiss({ type: 'highpass', from: 3000, to: 1800, gain: 0.2, duration: 0.05 });
  }

  snap() {
    this.hiss({ type: 'highpass', from: 5000, gain: 0.9, duration: 0.07 });
    this.tone(90, 'sine', { from: 400, to: 200, gain: 0.5, duration: 0.3 });
  }

  crackle() {
    for (let i = 0; i < 7; i += 1) this.hiss({ from: 2500 + i * 300, gain: 0.5, duration: 0.03, delay: i * 0.045 });
    this.tone(55, 'sawtooth', { gain: 0.2, duration: 0.5 });
  }

  thud() {
    this.tone(70, 'sine', { from: 300, gain: 0.5, duration: 0.35 });
  }

  clink() {
    this.tone(1800, 'triangle', { gain: 0.2, duration: 0.12 });
  }

  squawk() {
    this.tone(420, 'sawtooth', { from: 1400, to: 600, gain: 0.15, duration: 0.18 });
  }

  gust() {
    this.hiss({ type: 'lowpass', from: 300, to: 1500, gain: 0.5, duration: 1.2 });
  }

  go() {
    this.tone(880, 'triangle', { gain: 0.2, duration: 0.15 });
  }

  jingle() {
    JINGLE.forEach((midi, i) => this.pluck(midi, i * 0.08));
  }
}

const sfx = new Sfx(createAudioContext());

// ---------------------------------------------------------------------------
// 13. Duel view & HUD
// ---------------------------------------------------------------------------

const HUD = { margin: 24, nameY: 24, pipY: 56, pipGap: 30, meterY: 80, meterW: 120, meterH: 8 };
const FLAG = { x: W / 2, y: 26, length: 46, droop: 14 };
const CUES = {
  calma: { text: '¡CALMA! · JALA PARA SUBIR', color: COLORS.cream },
  rafaga: { text: '¡RÁFAGA!', color: COLORS.sun },
};
const VERDICTS = {
  cut: ['¡CORTADO!', 'LE CORTARON EL HILO'],
  line: ['¡CHISPAZO!', 'SE ENREDÓ EN EL CABLE'],
  ground: ['¡SE CAYÓ!', 'ATERRIZÓ EN LA AZOTEA'],
  draw: ['¡EMPATE!', 'LOS DOS AL SUELO'],
};
const GO_SHOWN = 0.7;
const COUNTDOWN_STEPS = 3;
// Camera choreography for points: hitstop is applied by the scene.
const SHOT = { zoom: 1.08, zoomMs: 260, shakeMs: 280, shake: 0.006, flashMs: 100, resetMs: 500, hitstop: 0.08 };
const FOCUS_EASE = 2;

/** Banner text, detail line and colour for the current moment of the duel. */
const bannerFor = (duel) => {
  if (duel.phase === 'countdown') {
    return [String(Math.ceil((duel.clock / ROUND.countdown) * COUNTDOWN_STEPS)), `RONDA ${duel.round + 1}`, COLORS.sun];
  }
  if (duel.verdict) {
    const { cause, winner } = duel.verdict;
    return [...VERDICTS[cause], winner === null ? COLORS.cream : COLORS.players[winner]];
  }
  return duel.elapsed < GO_SHOWN ? ['¡A VOLAR!', '', COLORS.sun] : ['', '', COLORS.cream];
};

/** Repaints a label with a vertical gradient from cream into `color`: chunky arcade banner type. */
const shine = (text, color) => {
  const fill = text.context.createLinearGradient(0, 0, 0, text.height);
  fill.addColorStop(0.2, css(COLORS.cream));
  fill.addColorStop(0.8, css(color));
  return text.setFill(fill);
};

/** Wind pennant at the top centre: it streams and waves in gusts, droops in a calm. */
const drawFlag = (g, drift, clock) => {
  const strength = Math.min(1.6, Math.abs(drift.vx) / BREEZE.speed);
  const tip = FLAG.x + (drift.vx < 0 ? -1 : 1) * FLAG.length * Math.max(0.25, strength);
  const wave = Math.sin(clock * (4 + strength * 6)) * 3 * strength;
  const droop = FLAG.droop * (1 - Math.min(1, strength));
  const mid = (FLAG.x + tip) / 2;
  g.lineStyle(4, ART.ink).lineBetween(FLAG.x, FLAG.y - 15, FLAG.x, FLAG.y + 18);
  g.fillStyle(COLORS.cream).fillPoints(
    [
      { x: FLAG.x, y: FLAG.y - 14 },
      { x: mid, y: FLAG.y - 12 + wave + droop / 2 },
      { x: tip, y: FLAG.y - 6 + droop },
      { x: mid, y: FLAG.y - 1 + wave + droop / 2 },
      { x: FLAG.x, y: FLAG.y },
    ],
    true,
  );
};

/** Names, score pips (little papagayos), JALAR meters, the wind pennant and the banners. */
class Hud {
  constructor(scene, names) {
    this.animations = scene.tweens;
    this.g = scene.add.graphics();
    const tags = names.map((name, player) =>
      label(scene, player === 0 ? HUD.margin : W - HUD.margin, HUD.nameY, name, { size: 18, color: COLORS.players[player] }).setOrigin(player, 0.5),
    );
    // Banners sit above the fight (which happens around y 150-350) so they never hide a cut.
    this.banner = label(scene, W / 2, 118, '', { size: 60 }).setShadow(0, 6, css(COLORS.ink), 0, true, true);
    this.detail = label(scene, W / 2, 166, '', { size: 18 });
    this.storm = label(scene, W / 2, 100, '¡VENTARRÓN!', { size: 24, color: COLORS.sun });
    this.cue = label(scene, W / 2, 130, '', { size: 22 });
    scene.tweens.add({ targets: [this.storm, this.cue], scale: 1.08, duration: 300, yoyo: true, repeat: -1 });
    this.shown = null;
    this.objects = [this.g, ...tags, this.banner, this.detail, this.storm, this.cue];
  }

  update(duel, drift, clock) {
    const g = this.g.clear();
    drawFlag(g, drift, clock);
    duel.kites.forEach((kite) => this.drawPlayer(g, kite, duel.score[kite.player]));
    const banner = bannerFor(duel);
    this.showBanner(banner);
    // Wind cues wait until the banner is gone so the two never overlap.
    const flying = duel.phase === 'fly' && !banner[0];
    this.storm.setVisible(duel.ventarron && flying);
    const cue = flying && CUES[windCue(duel)];
    this.cue.setVisible(Boolean(cue));
    if (cue) this.cue.setText(cue.text).setColor(css(cue.color));
  }

  drawPlayer(g, kite, points) {
    const left = kite.player === 0 ? HUD.margin : W - HUD.margin - HUD.meterW;
    const color = COLORS.players[kite.player];
    for (let pip = 0; pip < ROUND.wins; pip += 1) {
      drawPapagayo(g, left + 10 + pip * HUD.pipGap, HUD.pipY, 0, 0.32, KITE_COLORS[kite.player], pip < points);
    }
    const charge = 1 - kite.dashCooldown / DASH.cooldown;
    g.fillStyle(ART.ink, 0.7).fillRoundedRect(left - 2, HUD.meterY - 2, HUD.meterW + 4, HUD.meterH + 4, 4);
    g.fillStyle(charge === 1 ? color : COLORS.dim).fillRoundedRect(left, HUD.meterY, Math.max(HUD.meterH, HUD.meterW * charge), HUD.meterH, 3);
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

/** Everything the duel shows: backdrop, wind, birds, kids, kites, effects, camera work and HUD. */
class DuelView {
  constructor(scene, names) {
    this.camera = scene.cameras.main.setBounds(0, 0, W, H);
    this.backdrop = new Backdrop(scene);
    this.back = scene.add.graphics();
    this.backdrop.addForeground(scene);
    const glow = bake(scene, 'glow', SPRITES.glow, SPRITES.glow, paintDot(SPRITES.glow));
    this.glows = KITE_COLORS.map(([color]) => scene.add.image(0, 0, glow).setTint(color).setBlendMode(ADD()));
    this.front = scene.add.graphics();
    const glint = bake(scene, 'glint', SPRITES.glint, SPRITES.glint, paintGlint);
    this.glints = KITE_COLORS.map(() => scene.add.image(0, 0, glint).setBlendMode(ADD()));
    this.fx = new Fx(scene);
    const world = scene.children.list.slice();
    this.hud = new Hud(scene, names);
    this.camera.ignore(this.hud.objects);
    scene.cameras.add(0, 0, W, H).ignore(world);
    this.wind = new WindParticles();
    this.birds = new Birds();
    this.flyers = [0, 1].map((player) => new Flyer(player));
    this.day = 0;
    this.clock = 0;
    this.focus = W / 2;
  }

  update(duel, dt) {
    this.clock += dt;
    // The city feels the wind before the kites do: everything decorative shows the coming weather.
    const ahead = weatherAt(duel, duel.elapsed + WIND.lead);
    const drift = windDrift(ahead);
    this.day = lerp(this.day, dayPhase(duel.round), Math.min(1, dt * DAY.ease));
    this.focus = lerp(this.focus, (duel.kites[0].x + duel.kites[1].x) / 2, Math.min(1, dt * FOCUS_EASE));
    this.backdrop.update(this.day, drift, dt, this.focus);
    this.wind.update(drift, dt);
    this.birds.update(duel.zamuros, dt);
    this.fx.update(dt);
    duel.kites.forEach((kite, player) => {
      const { dashed, frayed } = this.flyers[player].update(kite, moodOf(duel.verdict, player), dt);
      if (dashed) sfx.whoosh();
      if (frayed) sfx.scratch();
    });
    sfx.setWind(ahead.wind);
    this.draw(duel, drift);
    this.hud.update(duel, drift, this.clock);
  }

  draw(duel, drift) {
    const { back, front, clock } = this;
    back.clear();
    this.wind.draw(back, drift);
    this.birds.draw(back, clock);
    duel.zamuros.forEach((zamuro) => drawVulture(back, zamuro.x, zamuro.y, Math.sin(clock * 12 + zamuro.x * 0.05), 1));
    front.clear();
    this.flyers.forEach((flyer, player) => {
      const kite = duel.kites[player];
      drawClothes(front, kite.anchor.x, -flyer.side, drift, clock);
      drawKid(front, flyer, kite);
    });
    this.fx.draw(front);
    duel.kites.forEach((kite, player) => this.drawKite(kite, this.flyers[player]));
  }

  drawKite(kite, flyer) {
    const { front } = this;
    const angle = kiteAngle(kite, flyer);
    drawTrail(front, flyer, kite);
    if (!kite.free) drawString(front, flyer, kite);
    drawTail(front, kite, flyer.colors);
    drawPapagayo(front, kite.x, kite.y, angle, 1, flyer.colors);
    if (!kite.free) drawFrenillo(front, kite, angle);
    this.glows[kite.player].setPosition(kite.x, kite.y).setScale(1.4).setAlpha(0.25 + 0.3 * this.day);
    const tip = kite.tail[TAIL.segments];
    const shimmer = 0.35 + 0.65 * Math.abs(Math.sin(flyer.clock * 5 + kite.player * 2));
    this.glints[kite.player].setPosition(tip.x, tip.y).setAlpha(shimmer).setRotation(flyer.clock);
  }

  /** Effects, camera work and sounds for each duel event. */
  react(event, duel) {
    const reactions = {
      go: () => sfx.go(),
      point: () => this.point(event, duel),
      round: () => this.reset(),
      clash: () => {
        const [a, b] = duel.kites;
        this.fx.sparks.explode(20, (a.x + b.x) / 2, (a.y + b.y) / 2);
        sfx.clink();
      },
      stun: () => {
        const kite = duel.kites[event.player];
        this.fx.sparks.explode(10, kite.x, kite.y);
        sfx.squawk();
      },
      ventarron: () => {
        this.camera.shake(SHOT.shakeMs * 2, SHOT.shake / 2);
        sfx.gust();
      },
    };
    if (reactions[event.type]) reactions[event.type]();
  }

  point({ cause, loser, winner }, duel) {
    if (cause === 'cut') this.cut(duel, loser);
    else if (cause === 'line') this.chispazo(duel.kites[loser]);
    else sfx.thud();
    if (winner !== null) sfx.jingle();
  }

  /** Flash, shake and a push-in on the cut point while the string snaps in two. */
  cut(duel, loser) {
    const victim = duel.kites[loser];
    const blade = duel.kites[1 - loser].tail[TAIL.segments];
    const at = nearestOnSegment(blade, victim.anchor, victim);
    this.fx.snap(at, () => this.flyers[loser].hand(victim), victim);
    this.camera.flash(SHOT.flashMs, 255, 255, 255);
    this.camera.shake(SHOT.shakeMs, SHOT.shake);
    this.camera.zoomTo(SHOT.zoom, SHOT.zoomMs);
    this.camera.pan(at.x, at.y, SHOT.zoomMs);
    sfx.snap();
  }

  chispazo(kite) {
    this.fx.zap(kite.x, kite.y);
    this.birds.scatter();
    this.camera.flash(SHOT.flashMs, 160, 220, 255);
    this.camera.shake(SHOT.shakeMs, SHOT.shake);
    sfx.crackle();
  }

  reset() {
    this.fx.clear();
    this.birds.reset();
    this.flyers.forEach((flyer) => flyer.reset());
    this.camera.zoomTo(1, SHOT.resetMs);
    this.camera.pan(W / 2, H / 2, SHOT.resetMs);
  }
}

/** Living backdrop for menus: a time of day with a steady, breathing breeze. */
class Scenery {
  constructor(scene, day) {
    this.backdrop = new Backdrop(scene);
    this.g = scene.add.graphics();
    this.backdrop.addForeground(scene);
    this.wind = new WindParticles();
    this.day = day;
    this.clock = 0;
  }

  update(dt) {
    this.clock += dt;
    const weather = { wind: 1 + 0.4 * Math.sin(this.clock * 0.5), gust: 80 * Math.sin(this.clock * 0.3) };
    const drift = windDrift(weather);
    this.backdrop.update(this.day, drift, dt, W / 2);
    this.wind.update(drift, dt);
    this.wind.draw(this.g.clear(), drift);
    sfx.setWind(weather.wind / 2);
  }
}

// ---------------------------------------------------------------------------
// 14. UI helpers
// ---------------------------------------------------------------------------

const MENU_GAP = 44;

/** Centred text with an ink outline so it reads over the sky. */
const label = (scene, x, y, text, { size = 24, color = COLORS.cream } = {}) =>
  scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: css(color),
      stroke: css(COLORS.ink),
      strokeThickness: Math.ceil(size / 6),
      align: 'center',
    })
    .setOrigin(0.5);

const panel = (scene, x, y, width, height) =>
  scene.add
    .graphics()
    .fillStyle(COLORS.ink, 0.85)
    .fillRoundedRect(x, y, width, height, 10)
    .lineStyle(2, COLORS.sun, 0.6)
    .strokeRoundedRect(x, y, width, height, 10);

/** Vertical joystick menu with a triangle cursor; confirming locks it so a choice fires once. */
class Menu {
  constructor(scene, x, y, items, onSelect) {
    this.onSelect = onSelect;
    this.index = 0;
    this.locked = false;
    this.items = items.map((text, i) => label(scene, x, y + i * MENU_GAP, text, { size: 28 }));
    this.cursor = scene.add.triangle(0, 0, 0, 0, 18, 11, 0, 22, COLORS.sun);
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
      item.setColor(css(selected ? COLORS.sun : COLORS.cream)).setScale(selected ? 1.1 : 1);
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
// 15. Scenes
// ---------------------------------------------------------------------------

const BOARD = { x: 250, y: 452, width: 300, height: 120, row: 16 };

/** Top-five table in a bottom panel. */
const addBoard = (scene) => {
  panel(scene, BOARD.x, BOARD.y, BOARD.width, BOARD.height);
  label(scene, W / 2, BOARD.y + 18, 'MEJORES PAPAGAYEROS', { size: 16, color: COLORS.sun });
  const rows = Array.from({ length: LEADERBOARD_SIZE }, (_, i) =>
    label(scene, W / 2, BOARD.y + 42 + i * BOARD.row, '', { size: 13 }),
  );
  const fill = (entries) => entries.forEach(({ name, score }, i) => rows[i].setText(`${i + 1}. ${name}  ${score}`));
  fill(Leaderboard.sanitize(null));
  // The scene may have been left before storage answers.
  Leaderboard.load().then((entries) => rows[0].active && fill(entries));
};

class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    Arcade.drain();
    this.scenery = new Scenery(this, 0);
    label(this, W / 2, 84, '¡PAPAGAYOS!', { size: 64, color: COLORS.sun });
    label(this, W / 2, 136, 'DUELO DE PAPAGAYOS SOBRE CARACAS', { size: 18 });
    label(this, W / 2, 380, 'JOYSTICK: DIRIGIR · B1: JALAR · B2: RECOGER HILO', { size: 14 });
    label(this, W / 2, 404, 'Corta el hilo del rival con la hojilla de tu cola', { size: 14, color: COLORS.dim });
    addBoard(this);
    this.menu = new Menu(this, W / 2, 210, ['1 JUGADOR', '2 JUGADORES'], (index) =>
      index === 0 ? this.pickRival() : this.scene.start('Duel', { mode: 'versus' }),
    );
  }

  pickRival() {
    this.menu.destroy();
    const names = RIVALS.map(({ name, barrio }) => `${name} · ${barrio}`);
    this.menu = new Menu(this, W / 2, 196, names, (level) => this.scene.start('Duel', { mode: 'solo', level }));
  }

  update(time, delta) {
    this.scenery.update(delta / 1000);
    for (const code of Arcade.drain()) this.menu.handle(code);
  }
}

/** A human pilot reads the held joystick and buttons; JALAR fires once per press. */
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
const RESULT_DELAY_MS = 900;

class DuelScene extends Phaser.Scene {
  constructor() {
    super('Duel');
  }

  init({ mode, level = 0 }) {
    this.mode = mode;
    this.level = level;
  }

  create() {
    Arcade.drain();
    const solo = this.mode === 'solo';
    this.names = solo ? ['TÚ', RIVALS[this.level].name] : ['JUGADOR 1', 'JUGADOR 2'];
    this.pilots = [new HumanPilot(0), solo ? new CpuPilot(this.level, 1) : new HumanPilot(1)];
    this.duel = createDuel(makeRng(Date.now()));
    this.view = new DuelView(this, this.names);
    this.pressed = new Set();
    this.lag = 0;
    this.hitstop = 0;
  }

  /** Fixed-step simulation; a hitstop freezes the world for a beat after a cut. */
  update(time, delta) {
    const dt = delta / 1000;
    for (const code of Arcade.drain()) this.pressed.add(code);
    const frozen = this.hitstop > 0;
    this.hitstop -= dt;
    if (!frozen) {
      this.lag = Math.min(this.lag + dt, MAX_LAG);
      while (this.lag >= DT) {
        this.lag -= DT;
        this.tick();
      }
    }
    const slowmo = this.duel.phase === 'verdict' ? ROUND.slowmo : 1;
    this.view.update(this.duel, frozen ? 0 : dt * slowmo);
  }

  tick() {
    const inputs = this.pilots.map((pilot) => pilot.input(this.duel, this.pressed));
    this.pressed.clear();
    for (const event of stepDuel(this.duel, inputs, DT)) {
      this.view.react(event, this.duel);
      if (event.cause === 'cut') this.hitstop = SHOT.hitstop;
      if (event.type === 'over') this.time.delayedCall(RESULT_DELAY_MS, () => this.finish());
    }
  }

  finish() {
    const { mode, level, names, duel } = this;
    this.scene.start('Result', { mode, level, names, winner: duel.winner, score: [...duel.score], round: duel.round });
  }
}

const RESULT_IDLE_MS = 25000;

const headline = ({ mode, winner, names }) => {
  if (mode === 'versus') return `¡GANÓ ${names[winner]}!`;
  return winner === 0 ? '¡GANASTE!' : '¡TE GANARON!';
};

class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(summary) {
    this.summary = summary;
  }

  create() {
    Arcade.drain();
    const { mode, level, winner, score, round } = this.summary;
    this.scenery = new Scenery(this, dayPhase(round));
    label(this, W / 2, 130, headline(this.summary), { size: 48, color: COLORS.players[winner] });
    label(this, W / 2, 190, `${score[0]} - ${score[1]}`, { size: 36 });
    this.menu = new Menu(this, W / 2, 270, ['REVANCHA', 'MENÚ PRINCIPAL'], (index) =>
      index === 0 ? this.leave('Duel', { mode, level }) : this.leave('Title'),
    );
    this.leaving = false;
    this.idle = 0;
  }

  leave(key, data) {
    this.leaving = true;
    this.scene.start(key, data);
  }

  update(time, delta) {
    this.scenery.update(delta / 1000);
    const presses = Arcade.drain();
    this.idle = presses.length ? 0 : this.idle + delta;
    presses.forEach((code) => this.menu.handle(code));
    if (!this.leaving && this.idle > RESULT_IDLE_MS) this.leave('Title');
  }
}

// ---------------------------------------------------------------------------
// 16. Boot
// ---------------------------------------------------------------------------

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: css(COLORS.ink),
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, DuelScene, ResultScene],
});
})();
