// ¡Papagayos! — Platanus Hack 26 Caracas Edition
// Kite duel over Caracas: sweep your tail's blade across the rival's string to cut it.

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const W = 800;
const H = 600;
const TAU = Math.PI * 2;
const FONT = '"Arial Black", "Arial Bold", Arial, sans-serif';

const COLORS = {
  ink: 0x161029,
  skyTop: 0x2b1b54,
  skyBottom: 0xff9a5a,
  sun: 0xffc04d,
  avila: 0x3b3768,
  city: 0x2a2140,
  wall: 0x8a4b3a,
  roof: 0x5a2e2a,
  pole: 0x2a1d1a,
  wire: 0x120c10,
  cream: 0xfff3d6,
  dim: 0xb7a6d8,
  blade: 0xffffff,
  danger: 0xff3b4e,
  zamuro: 0x1b1418,
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

const pointSegmentDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

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

/** Each point is pulled back to its leader at exactly one segment length (follow-the-leader). */
const follow = (point, leader) => {
  const gap = distance(point, leader) || 1;
  point.x = leader.x + ((point.x - leader.x) * TAIL.segment) / gap;
  point.y = leader.y + ((point.y - leader.y) * TAIL.segment) / gap;
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
// aggression: chance to go sawing on each decision instead of holding high above its anchor.
const RIVALS = [
  { name: 'EL CHAMO', barrio: 'Catia', reaction: 0.75, aim: 100, dashRange: 20, guard: 0, nerve: 430, foresight: 0, aggression: 0.75 },
  { name: 'LA FLACA', barrio: 'Petare', reaction: 0.38, aim: 40, dashRange: 70, guard: 0.3, nerve: 420, foresight: 0.4, aggression: 0.8 },
  { name: 'EL CATIRE', barrio: 'La Pastora', reaction: 0.27, aim: 34, dashRange: 90, guard: 0.45, nerve: 400, foresight: 0.6, aggression: 0.85 },
  { name: 'DON GOYO', barrio: 'El Valle', reaction: 0.15, aim: 12, dashRange: 110, guard: 0.8, nerve: 380, foresight: 0.9, aggression: 1 },
];
// strikeAlong: where on the rival string to aim, as a fraction from its kite toward its anchor;
// overshoot: how far past the string each saw stroke reaches.
const CPU = { strikeAlong: 0.25, overshoot: 50, floor: 390, threat: 90, deadzone: 10 };

const createCpu = (level, player, rng) => ({
  spec: RIVALS[level],
  player,
  rng,
  think: 0,
  target: null,
  reel: false,
  dash: false,
});

/** Kite position that hangs the blade across the rival string, a little below the rival kite. */
const strikePoint = (rival) => ({
  x: rival.x + (rival.anchor.x - rival.x) * CPU.strikeAlong,
  y: rival.y + (rival.anchor.y - rival.y) * CPU.strikeAlong - BLADE_DEPTH,
});

/** Aims past the strike point on the far side of the string, so the blade saws across it. */
const sawPoint = (me, rival) => {
  const strike = strikePoint(rival);
  const [nx, ny] = stringNormal(rival);
  const side = (me.x - strike.x) * nx + (me.y - strike.y) * ny < 0 ? 1 : -1;
  return { x: strike.x + side * nx * CPU.overshoot, y: strike.y + side * ny * CPU.overshoot };
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
  if (sinking(cpu, duel, me)) {
    Object.assign(cpu, { target: { x: me.x, y: 0 }, reel: false, dash: true });
    return;
  }
  cpu.reel = threatened(me, rival) && rng() < spec.guard;
  const attacks = !cpu.reel && rng() < spec.aggression;
  const aim = attacks ? sawPoint(me, rival) : retreatPoint(me);
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
  return {
    ax: axis(cpu.target.x - me.x),
    ay: axis(cpu.target.y - me.y),
    dash: dashNow,
    reel: cpu.reel,
  };
};

// ---------------------------------------------------------------------------
// 8. Rendering
// ---------------------------------------------------------------------------

const AVILA = [
  [0, 360], [90, 300], [170, 272], [260, 242], [340, 226], [420, 234],
  [500, 214], [590, 246], [680, 270], [760, 300], [800, 320], [800, 470], [0, 470],
];
const ROOF_WIDTH = 120;
const KITE_SHAPE = [[0, -43], [27, 0], [0, 22], [-27, 0]];
const SPIN_RATE = 18;
const HUD = { margin: 24, pipY: 54, pipGap: 22, meterY: 72, meterW: 120 };
const FLAG = { x: W / 2, y: 22, length: 40, droop: 14 };
const CUES = {
  calma: { text: '¡CALMA! · JALA PARA SUBIR', color: COLORS.cream },
  rafaga: { text: '¡RÁFAGA!', color: COLORS.sun },
};

/** Linear blend of two 0xRRGGBB colours. */
const mixColor = (from, to, t) => {
  const channel = (shift) => {
    const a = (from >> shift) & 0xff;
    return Math.round(a + (((to >> shift) & 0xff) - a) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
};

const drawSky = (g) => {
  g.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyBottom, COLORS.skyBottom, 1).fillRect(0, 0, W, ROOF_Y);
  g.fillStyle(COLORS.sun, 0.8).fillCircle(W / 2, 330, 60);
  g.fillStyle(COLORS.avila).fillPoints(AVILA.map(([x, y]) => ({ x, y })), true);
};

/** Back row of blocks, then the two flyers' rooftops and the street buildings in between. */
const drawCity = (g) => {
  const rng = makeRng(26);
  g.fillStyle(COLORS.city);
  for (let x = 0; x < W; x += 40) g.fillRect(x, 430 + rng() * 40, 40, H);
  g.fillStyle(COLORS.wall);
  for (let x = POWER_LINE.from; x < POWER_LINE.to; x += 55) g.fillRect(x, 548 + rng() * 30, 50, H);
  ANCHORS.forEach(({ x }) => {
    const left = x - ROOF_WIDTH / 2;
    g.fillStyle(COLORS.wall).fillRect(left, ROOF_Y, ROOF_WIDTH, H - ROOF_Y);
    g.fillStyle(COLORS.roof).fillRect(left - 6, ROOF_Y - 4, ROOF_WIDTH + 12, 8);
  });
};

const drawPowerLines = (g) => {
  g.fillStyle(COLORS.pole);
  [POWER_LINE.from, POWER_LINE.to].forEach((x) => g.fillRect(x - 3, POWER_LINE.y - 14, 6, H));
  const wire = (offset) =>
    Array.from({ length: 23 }, (_, i) => {
      const x = POWER_LINE.from + (i * (POWER_LINE.to - POWER_LINE.from)) / 22;
      return { x, y: powerLineY(x) + offset };
    });
  g.lineStyle(2, COLORS.wire).strokePoints(wire(-3)).strokePoints(wire(3));
};

const drawFlyers = (g) =>
  ANCHORS.forEach(({ x, y }, player) => {
    g.fillStyle(COLORS.players[player]).fillRect(x - 7, y - 18, 14, ROOF_Y - y + 18);
    g.fillStyle(COLORS.cream).fillCircle(x, y - 25, 7);
  });

const drawBackdrop = (g) => {
  drawSky(g);
  drawCity(g);
  drawPowerLines(g);
  drawFlyers(g);
  return g;
};

/** Wind flag at the top: it streams with the gust and droops in a calm. */
const drawFlag = (g, { wind, gust }) => {
  const strength = Math.min(wind, WIND.rafaga);
  const tip = FLAG.x + (gust < 0 ? -1 : 1) * FLAG.length * strength;
  const droop = FLAG.y - 6 + FLAG.droop * Math.max(0, 1 - strength);
  g.lineStyle(2, COLORS.cream).lineBetween(FLAG.x, FLAG.y - 12, FLAG.x, FLAG.y + 16);
  g.fillStyle(COLORS.cream).fillTriangle(FLAG.x, FLAG.y - 12, FLAG.x, FLAG.y, tip, droop);
};

const drawZamuro = (g, { x, y }, clock) => {
  const flap = Math.sin(clock * 12 + x) * 8;
  g.lineStyle(4, COLORS.zamuro).beginPath().moveTo(x - 20, y + flap).lineTo(x, y).lineTo(x + 20, y + flap).strokePath();
};

const kiteAngle = (kite) =>
  Math.atan2(kite.y - kite.anchor.y, kite.x - kite.anchor.x) + Math.PI / 2 + kite.stun * SPIN_RATE;

/** Tail in the player colour, then the white hojilla with a shard at every blade joint. */
const drawTail = (g, kite) => {
  const blade = kite.tail.slice(TAIL.bladeFrom);
  g.lineStyle(3, COLORS.players[kite.player]).strokePoints(kite.tail.slice(0, TAIL.bladeFrom + 1));
  g.lineStyle(4, COLORS.blade).strokePoints(blade);
  g.fillStyle(COLORS.blade);
  blade.forEach(({ x, y }) => g.fillTriangle(x - 6, y, x + 6, y, x, y + 9));
};

const drawKite = (g, kite) => {
  const worn = mixColor(COLORS.cream, COLORS.danger, Math.min(1, kite.fray / FRAY.toughness));
  if (!kite.free) g.lineStyle(1.5 + kite.fray / 30, worn).lineBetween(kite.anchor.x, kite.anchor.y, kite.x, kite.y);
  drawTail(g, kite);
  const angle = kiteAngle(kite);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const corners = KITE_SHAPE.map(([x, y]) => ({ x: kite.x + x * cos - y * sin, y: kite.y + x * sin + y * cos }));
  g.fillStyle(COLORS.players[kite.player]).fillPoints(corners, true);
  g.lineStyle(3, COLORS.ink).strokePoints(corners, true);
};

/** Score pips and the JALAR meter in each top corner. */
const drawHud = (g, kite, points) => {
  const left = kite.player === 0 ? HUD.margin : W - HUD.margin - HUD.meterW;
  const color = COLORS.players[kite.player];
  for (let pip = 0; pip < ROUND.wins; pip += 1) {
    const x = left + 8 + pip * HUD.pipGap;
    g.lineStyle(2, color).strokeCircle(x, HUD.pipY, 7);
    if (pip < points) g.fillStyle(color).fillCircle(x, HUD.pipY, 7);
  }
  const charge = 1 - kite.dashCooldown / DASH.cooldown;
  g.fillStyle(COLORS.ink, 0.6).fillRect(left, HUD.meterY, HUD.meterW, 8);
  g.fillStyle(charge === 1 ? color : COLORS.dim).fillRect(left, HUD.meterY, HUD.meterW * charge, 8);
};

const VERDICTS = {
  cut: '¡CORTADO!',
  line: '¡SE ENREDÓ EN EL CABLE!',
  ground: '¡SE CAYÓ!',
  draw: '¡EMPATE!',
};
const GO_SHOWN = 0.7;
const COUNTDOWN_STEPS = 3;

const bannerFor = (duel) => {
  if (duel.phase === 'countdown') return String(Math.ceil((duel.clock / ROUND.countdown) * COUNTDOWN_STEPS));
  if (duel.verdict) return VERDICTS[duel.verdict.cause];
  return duel.elapsed < GO_SHOWN ? '¡A VOLAR!' : '';
};

class DuelView {
  constructor(scene, names) {
    drawBackdrop(scene.add.graphics());
    this.g = scene.add.graphics();
    names.forEach((name, player) => {
      const x = player === 0 ? HUD.margin : W - HUD.margin;
      label(scene, x, 26, name, { size: 18, color: COLORS.players[player] }).setOrigin(player, 0.5);
    });
    this.banner = label(scene, W / 2, 200, '', { size: 52 });
    this.storm = label(scene, W / 2, 98, '¡VENTARRÓN!', { size: 24, color: COLORS.sun }).setVisible(false);
    this.cue = label(scene, W / 2, 126, '', { size: 20 });
    scene.tweens.add({ targets: [this.storm, this.cue], alpha: 0.4, duration: 300, yoyo: true, repeat: -1 });
  }

  render(duel) {
    const g = this.g.clear();
    drawFlag(g, weatherAt(duel));
    duel.zamuros.forEach((zamuro) => drawZamuro(g, zamuro, duel.elapsed));
    duel.kites.forEach((kite) => drawKite(g, kite));
    duel.kites.forEach((kite) => drawHud(g, kite, duel.score[kite.player]));
    const winner = duel.verdict ? duel.verdict.winner : null;
    this.banner.setText(bannerFor(duel)).setColor(css(winner === null ? COLORS.cream : COLORS.players[winner]));
    const flying = duel.phase === 'fly';
    this.storm.setVisible(duel.ventarron && flying);
    const cue = flying && CUES[windCue(duel)];
    this.cue.setVisible(Boolean(cue));
    if (cue) this.cue.setText(cue.text).setColor(css(cue.color));
  }
}

// ---------------------------------------------------------------------------
// 9. UI helpers
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
// 10. Scenes
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
    drawBackdrop(this.add.graphics());
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

  update() {
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
  }

  update(time, delta) {
    for (const code of Arcade.drain()) this.pressed.add(code);
    this.lag = Math.min(this.lag + delta / 1000, MAX_LAG);
    while (this.lag >= DT) {
      this.lag -= DT;
      this.tick();
    }
    this.view.render(this.duel);
  }

  tick() {
    const inputs = this.pilots.map((pilot) => pilot.input(this.duel, this.pressed));
    this.pressed.clear();
    for (const event of stepDuel(this.duel, inputs, DT)) {
      if (event.type === 'over') this.time.delayedCall(RESULT_DELAY_MS, () => this.finish());
    }
  }

  finish() {
    const { mode, level, names, duel } = this;
    this.scene.start('Result', { mode, level, names, winner: duel.winner, score: [...duel.score] });
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
    const { mode, level, winner, score } = this.summary;
    drawBackdrop(this.add.graphics());
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
    const presses = Arcade.drain();
    this.idle = presses.length ? 0 : this.idle + delta;
    presses.forEach((code) => this.menu.handle(code));
    if (!this.leaving && this.idle > RESULT_IDLE_MS) this.leave('Title');
  }
}

// ---------------------------------------------------------------------------
// 11. Boot
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
