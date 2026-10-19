// PAPAGAYO KOMBAT: Guerra en el cielo de Caracas — Platanus Hack 26 Caracas Edition
// Kite duel over Caracas: sweep your tail's blade (the hojilla) across the rival's string to cut it.

// The whole game lives in one function scope (left unindented) so the minifier can shorten every name.
(function () {

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

// Every plain-number setting lives here, ahead of any other statement, grouped by the section that uses it:
// minifiers like esbuild only fold constants declared before the first statement that does real work.

// Screen (world units)
const W = 800;
const H = 600;

// Storage & leaderboard
const LEADERBOARD_SIZE = 5;

// Kite physics
const SPAWN_Y = 280;
const STRING_MIN = 180;
const STRING_BASE = 400;
const STRING_REEL = 240;
const STRING_PAYOUT = 70;
// The wind pushes a kite with a fixed force (times the wind strength); the stick only redirects it,
// so no amount of steering beats gravity in a calm. Lean tilts that force toward the valley centre.
const KITE_RADIUS = 25;
const KITE_DRAG = 2.4;
const KITE_AERO = 1020;
const KITE_CLIMB = 0.6;
const KITE_LEAN = 0.25;
const KITE_SLACK_AERO = 0.85;
const KITE_GRAVITY = 680;
const KITE_GUST = 150;
const TAUT_SLACK = 4;
// JALAR (B1): pressing gives a burst along the stick plus a tug that always lifts: an upward kick, then `tug`
// seconds in which the kite flies on full lift as if the wind blew at least `tugWind` (a taut line can't climb
// past its end). Holding B1 keeps that lift on while it drains the AIRE meter.
const DASH_BURST = 200;
const DASH_LIFT = 400;
const DASH_TUG = 0.15;
const DASH_TUG_WIND = 1;
// AIRE meter (0-1): a press costs `press`, holding drains `drain`/s and flies the kite as if the wind blew at
// least `wind`; otherwise it refills `refill`/s. A hold that runs the meter dry lapses (it refills even with B1
// still down) and lifts again once a press is affordable, so a held B1 never leaves the kite stranded.
const AIR_PRESS = 0.35;
const AIR_WIND = 0.75;
const STUN = 0.6;
// The last segments (from bladeFrom on) carry the hojilla that cuts.
const TAIL_SEGMENTS = 12;
const TAIL_SEGMENT = 12;
const TAIL_BLADE_FROM = 8;
const TAIL_GRAVITY = 520;
const TAIL_DAMPING = 0.985;
const TAIL_WIND_DRAG = 0.35;
// How far below the kite the middle of its blade hangs at rest.
const BLADE_DEPTH = KITE_RADIUS + (TAIL_SEGMENT * (TAIL_BLADE_FROM + TAIL_SEGMENTS)) / 2;
// A blade only saws while its speed across the rival string exceeds this.
const SWEEP_SPEED = 220;
// Sawing frays a string by the blade's travel across it (px); it snaps at toughness and slowly
// recovers, so a cut takes a few quick strokes in a row ("serruchar").
const FRAY_TOUGHNESS = 100;
const FRAY_RECOVERY = 15;

// Duel rules
// Power lines hang between two poles over the street, sagging toward the middle.
const POWER_LINE_FROM = 230;
const POWER_LINE_TO = 570;
const POWER_LINE_Y = 462;
const POWER_LINE_SAG = 16;
const POWER_LINE_HALF = 4;
const ROOF_Y = 530;
const ZAMURO_RADIUS = 20;
const ZAMURO_SPEED = 110;
const ZAMURO_MARGIN = 40;
const CLASH_BOUNCE = 260;
const CLASH_GRACE = 0.35;
// One 3-2-1, then non-stop flying. TIEMPO lasts `time` s and its last `double` s count twice; VIDAS gives each
// side `lives` kites. `hint` is how long the first calm keeps teaching the hold.
const MATCH_COUNTDOWN = 1.8;
const MATCH_TIME = 90;
const MATCH_DOUBLE = 10;
const MATCH_LIVES = 3;
const MATCH_HINT = 20;
// A lost kite is replaced at once: the new one rises from `low` px above the hands for `climb` s, then stays
// untouchable (blinking) for `guard` s.
const RESPAWN_CLIMB = 1.5;
const RESPAWN_GUARD = 1.2;
const RESPAWN_LOW = 40;
// Wind strength swings through a slow cycle of gusts and calms; lead is how early the cue warns.
const WIND_FLUTTER = 0.12;
const WIND_FLUTTER_RATE = 1.7;
const WIND_GUST_RATE = 0.45;
const WIND_LULL = 0.55;
const WIND_RAFAGA = 1.45;
const WIND_LEAD = 1.5;
const WIND_OPENING = 0.3;
// How deep the lulls swing in versus (the ladder's are in LULLS_LADDER).
const LULLS_VERSUS = 0.64;
// Power boxes: one every `every` s (at most `max` around), drifting `drift` × the gust, gone after `life` s.
const BOX_MAX = 2;
const BOX_LIFE = 12;
const BOX_RADIUS = 18;
const BOX_DRIFT = 0.4;
// VIDRIO and TURBO last that many seconds; TURBO pushes `push` × harder; the allied zamuro chases at `ally` px/s
// for `allyLife` s and stuns for `stun` s.
const POWER_VIDRIO = 8;
const POWER_TURBO = 5;
const POWER_PUSH = 1.35;
const POWER_ALLY = 260;
const POWER_ALLY_LIFE = 4;
const POWER_STUN = 1;

// CPU rival
// strikeAlong: where on the rival string to aim, as a fraction from its kite toward its anchor.
const CPU_STRIKE_ALONG = 0.25;
const CPU_FLOOR = 390;
const CPU_THREAT = 90;
const CPU_DEADZONE = 10;

// Score, stats & ladder
// Solo points: a cut is worth more than a rival's crash (both doubled when the point is); beating rival n pays
// `win` × n, plus `flawless` if the rival never scored.
const SCORE_CUT = 1000;
const SCORE_CRASH = 400;
const SCORE_WIN = 2000;
const SCORE_FLAWLESS = 1500;
const LETTER_COUNT = 26;

// Avatars
const HAIR_TONES_DARK = 0x2b1a12;
const HAIR_TONES_WHITE = 0xeeeae2;

// Art direction
const RIM = 0xffa25e;
const STICK = 0x4a2c18;
const STEEL = 0xe8eef7;
const WIRE = 0x150c13;
const ZAMURO_INK = 0x17111a;
const ZAMURO_TIP = 0xcfc6bd;
const WINDOW_LIT = 0xffd27a;
// Visible breeze (px/s): papelitos race in a gust, drift and sink in a calm.
const BREEZE_SPEED = 120;
const BREEZE_GUST = 0.6;
const BREEZE_SINK = 60;
const SAG_TAUT = 3;
const SAG_SLACK = 0.6;
const SAG_MAX = 90;
// A cut kite tumbles away: heavy, spinning, nudged by the gust (presentation only).
const FALL_GRAVITY = 900;
const FALL_DRIFT = 0.8;
const FALL_DRAG = 0.6;
const FALL_SPIN = 9;

// Pixel art: font and backdrop painters
// The canvas is a quarter of the 800×600 world: every screen pixel is PIXEL world units wide, so everything the
// game draws comes out in chunky pixels. Backdrop textures are painted pixel by pixel at that resolution.
const PIXEL = 2;
const PW = W / PIXEL;
const PH = H / PIXEL;
// Background layers are wider than the screen so they can slide for parallax.
const PARALLAX = 40;
const WIDE = (W + 2 * PARALLAX) / PIXEL;
const FONT_CELL = 7;
const FONT_HEIGHT = 11;
const FONT_ADVANCE = 6;
const FONT_PER_ROW = 16;
const HORIZON = 236;
const SKY_BANDS = 12;
const SUN_X = 150;
const SUN_Y = 250;
const SUN_SIZE = 48;
const HUMBOLDT_BODY = 0xe8e2f0;
const HUMBOLDT_BAND = 0x9a8fb4;
const CABLE_CAR_FROM = 0.08;
const CABLE_CAR_COLOR = 0xd8323c;
const RANCHO_ROOF = 0x5a3a4a;
const CERROS_REACH = 175;
const CERROS_RISE = 78;
const CERROS_FOOT = 246;
const CERROS_RANCHOS = 230;
const DARK_GLASS = 0x2a2440;
const CITY_DEPTH = 0.09;
const POLE_TOP = 223;
const POLE_BAR = 27;
// Azoteas seen slightly from above: the kid stands on the front edge of a deck whose back edge is ROOF_Y.
const DECK = 572;
const AZOTEA_HALF = 40;
const TANK_BODY = 0x2c5aa0;
const TANK_LIGHT = 0x5b8fd8;
const TANK_DARK = 0x1d3d6e;

// Actors: wind, zamuros, kids, kites
// Particles turn into streaks exactly when the wind reaches the ¡RÁFAGA! threshold.
const WIND_PARTICLES_COUNT = 70;
const WIND_PARTICLES_TOP = 20;
const WIND_PARTICLES_BOTTOM = 520;
const WIND_PARTICLES_STREAK = BREEZE_SPEED * WIND_RAFAGA;
const WIND_PARTICLES_TRACE = 0.06;
// The kid stands on the front edge of the deck, larger than life; the string hand rests on the physics anchor and
// the other hand (`grip` px behind it) holds the line.
const KID_FOOT = DECK - 2;
const KID_BACK = 18;
const KID_SCALE = 1.45;
const KID_JUMP = 16;
const KID_SLUMP = 6;
const KID_GRIP = 10;
// Figure proportions in local units: feet at y 0 and up is negative; looks and poses scale and flip it. The head
// sits `headR - 2` above the shoulders, so it always rests on the collar (a slump or a hunch only sinks it lower).
const FIGURE_HIP = -28;
const FIGURE_SHOULDER = -58;
const FIGURE_HEAD = -66;
const FIGURE_HEAD_R = 10;
const FIGURE_HUNCH = 5;
const FACE_INK = 0x2a1810;
const FACE_BLUSH = 0xff7a8a;
const FACE_TEAR = 0x8fd3ff;
const PANTS = 0x2c3550;
const HEADGEAR_CAP = 0xd8323c;
const HEADGEAR_WOOL = 0xf2f2f2;
const HEADGEAR_RUANA = 0x8a3a8a;
const HEADGEAR_STRIPE = 0xffd23f;
const HEADGEAR_FLOWER = 0xff5d8f;
const HEADGEAR_HAT = 0x8a6a3a;
const HEADGEAR_BAND = 0x3b2414;
// How long a kid celebrates (or sulks) after a point.
const CHEER_S = 1.2;
const SPIN_RATE = 18;
const YANK_DECAY = 4;
const BRIDLE = 16;
const FLUTTER_RATE = 9;
const FLUTTER_SWING = 0.05;
const FLUTTER_LEAN = 0.0015;
// Power colours and icons: glass shards, a turbo bolt, a nylon ring and a little vulture.
const GLASS = 0x8ff3ff;
const TURBO_BOLT = 0xffd23f;
const CRATE_SIZE = 32;
const CRATE_WOOD = 0xb06a32;
const CRATE_EDGE = 0x6a3a1a;

// Effects & audio
const BURST_SPARKS = 45;
const ATTACK = 0.006;
const CHIP_LEVEL = 0.42;
const CHIP_AHEAD = 0.3;
const CHIP_EVERY = 50;

// Duel view & HUD
const HUD_MARGIN = 24;
const HUD_NAME_Y = 24;
const HUD_SCORE_Y = 56;
const HUD_PIP_GAP = 30;
const HUD_PIP_SCALE = 0.36;
const HUD_METER_Y = 84;
const HUD_METER_W = 120;
const HUD_METER_H = 10;
const HUD_POWER_Y = 104;
const HUD_CLOCK_Y = 30;
// Every centre announcement shares ONE banner slot for `seconds`. A higher rank cuts in at once (the shout it
// interrupts waits again); the rest wait in line, by rank then age, and only the `keep` highest stay queued.
// Wind cues and hints only show while the slot is empty.
const BANNER_SECONDS = 1.2;
const BANNER_KEEP = 2;
const REFUSE_S = 0.3;
const COUNTDOWN_STEPS = 3;
// Juice for a cut: the duel loop freezes for `hitstop` s, then the camera shakes.
const SHOT_SHAKE_MS = 280;
const SHOT_SHAKE = 0.006;
const SHOT_HITSTOP = 0.15;
const FOCUS_EASE = 2;

// UI helpers
const MENU_GAP = 48;
// Every menu screen shares a big heading near the top and a help line along the bottom.
const SCREEN_HEADING = 46;
const SCREEN_FOOTER = 586;

// Scenes
// The top-five panel: rows start `firstRow` px below its top; scores are right-aligned in `scoreWidth` characters.
const BOARD_X = 110;
const BOARD_Y = 420;
const BOARD_WIDTH = 580;
const BOARD_HEIGHT = 146;
const BOARD_FIRST_ROW = 48;
const BOARD_ROW = 19;
const BOARD_SCORE_WIDTH = 7;
// Caps the catch-up after a stalled frame so the simulation never spirals.
const MAX_LAG = 0.1;
const ATTRACT_RESTART_MS = 2500;
const ATTRACT_IDLE_MS = 30000;
// The logo stacks PAPAGAYO over a bigger, hotter KOMBAT and the subtitle; `lines` are their [y offset, size].
const LOGO_Y = 84;
const LOGO_SHADOW = PIXEL * 3;
const LOGO_SWAY = 0.03;
const LOGO_SWAY_MS = 1800;
const LOGO_KOMBAT = 0xff3b2f;
// The title menu sits on a dark backing so the demo kites flying behind it never hide its text.
const TITLE_MENU_Y = 250;
const TITLE_BACKING_X = 200;
const TITLE_BACKING_Y = 214;
const TITLE_BACKING_WIDTH = 400;
const TITLE_BACKING_HEIGHT = 120;
// The opening, in seconds (5 in all, over the chiptune): fade in on the sun and pull back over Caracas; the kid
// launches, the rival rises, the kid saws across its string (fraying it up to `fray` of its toughness) until it
// snaps; then the logo slams in, `slamScale` times bigger, where the title shows it. Any button skips.
const OPENING_FADE_MS = 700;
const OPENING_PULL = 1.4;
const OPENING_LAUNCH = 0.8;
const OPENING_CLIMB = 0.8;
const OPENING_RIVAL = 1.1;
const OPENING_SAW = 2.1;
const OPENING_CUT = 3.1;
const OPENING_SLAM = 3.5;
const OPENING_END = 5;
const OPENING_STROKE = 45;
const OPENING_STROKE_RATE = 10;
const OPENING_FRAY = 0.9;
const OPENING_SLAM_SCALE = 4;
const OPENING_SLAM_MS = 280;
const OPENING_SLAM_SPARKS = 60;
const OPENING_SEED = 26;
// CÓMO JUGAR: shown after choosing the rules, before building the papagayero; B1/START or `ms` moves on.
// `margin`/`top`/`height` frame the panel; in versus the two cabinets sit at `columns` (x).
const HOWTO_MS = 8000;
const HOWTO_MARGIN = 30;
const HOWTO_TOP = 80;
const HOWTO_HEIGHT = 482;
const HOWTO_CABINET_Y = 180;
const HOWTO_LEGEND_Y = 312;
const HOWTO_LINE_GAP = 42;
const HOWTO_GOAL_Y = 432;
const HOWTO_POWERS_Y = 470;
const HOWTO_POWER_GAP = 170;
// One player's half of the cabinet: the joystick, then two rows of three numbered buttons (the bottom row is
// unused). The real button colours are unknown, so they are drawn neutral and always named by number. x offsets
// are from the panel centre, y offsets from the top button row; key hints sit `hint` px above their control.
const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 160;
const PANEL_TOP = -60;
const PANEL_PLATE = 0x3a2a50;
const PANEL_CAP = 0xe4dccf;
const PANEL_HINT = -42;
const JOYSTICK_X = -95;
const JOYSTICK_BASE = 40;
const JOYSTICK_BASE_R = 30;
const JOYSTICK_BALL = 4;
const JOYSTICK_BALL_R = 15;
const JOYSTICK_SHAFT = 4;
const BUTTONS_X = -15;
const BUTTONS_GAP = 58;
const BUTTONS_ROW = 58;
const BUTTONS_RADIUS = 20;
const BUTTONS_RING = 6;
const BUTTONS_USED = 2;
const BUTTONS_UNUSED_ALPHA = 0.4;
// "ARMA TU PAPAGAYERO": each player builds a look before playing; the last choice is remembered.
// In versus the two columns sit at `columns` (x); a confirmed column turns `ready` green.
const BUILD_TOP = 92;
const BUILD_HEIGHT = 386;
const BUILD_WIDTH = 372;
const BUILD_ROWS_Y = 150;
const BUILD_ROW_GAP = 52;
const BUILD_IDLE_MS = 30000;
const BUILD_LEAVE_MS = 700;
const BUILD_PREVIEW = 2.1;
const BUILD_READY = 0x7dff8a;
const INTRO_MS = 3200;
// Names longer than `longName` letters drop to a smaller size to fit beside the portrait.
const CARD_LEFT = 100;
const CARD_TOP = 150;
const CARD_WIDTH = 600;
const CARD_HEIGHT = 280;
const CARD_TEXT_X = 480;
const CARD_LAND = 230;
const CARD_LONG_NAME = 10;
const CARD_BOTTOM = CARD_TOP + CARD_HEIGHT;
const RESULT_DELAY_MS = 1200;
const RESULT_IDLE_MS = 25000;
const INITIALS_IDLE_MS = 30000;
// Result screen rows, top to bottom (y); the stats table spans `statsWidth` px and its rows are `statRow` apart.
const RESULT_TITLE = 70;
const RESULT_SUBTITLE = 116;
const RESULT_STATS = 166;
const RESULT_STATS_WIDTH = 420;
const RESULT_STAT_ROW = 22;
const RESULT_TOTAL = 334;
const RESULT_MENU = 360;
const RESULT_RECORD = 372;
const RESULT_PROMPT = 386;
const RESULT_HELP = 486;
const INITIALS_LENGTH = 3;
const INITIALS_Y = 420;
const INITIALS_GAP = 64;

// Short names for the Math functions used everywhere.
const { sin, cos, max, min, abs, PI, sign, hypot, floor, round, exp, ceil, atan2, sqrt } = Math;
const TAU = PI * 2;
const { assign } = Object;

// Palette shared by the art and the UI; the player colours also identify each side in the HUD.
const [INK, GOLD, CREAM, DIM, DANGER, WHITE] = [0x1a0f22, 0xffc04d, 0xfff3d6, 0xb7a6d8, 0xff3b4e, 0xffffff];
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

const MENU_CODES_UP = ['P1_U', 'P2_U'];
const MENU_CODES_DOWN = ['P1_D', 'P2_D'];
const MENU_CODES_LEFT = ['P1_L', 'P2_L'];
const MENU_CODES_RIGHT = ['P1_R', 'P2_R'];
const MENU_CODES_CONFIRM = ['START1', 'START2', 'P1_1', 'P2_1'];

const isConfirm = (code) => MENU_CODES_CONFIRM.includes(code);

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
const DEFAULT_LEADERBOARD = [
  ['REY', 30000],
  ['AVI', 18000],
  ['PAP', 10000],
  ['COL', 5000],
  ['VLA', 2000],
].map(([name, score]) => ({ name, score }));

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
// AIRE drain and refill rates (per second); the rest of the meter is set in section 1.
const AIR_DRAIN = 1 / 0.9;
const AIR_REFILL = 1 / 1.5;
const IDLE_INPUT = { ax: 0, ay: 0, dash: false, hold: false, reel: false };

const tailPin = (kite) => ({ x: kite.x, y: kite.y + KITE_RADIUS });

/** Lays the tail straight down from the kite, at rest. */
const hangTail = (kite) => {
  const pin = tailPin(kite);
  kite.tail = range(TAIL_SEGMENTS + 1, (i) => {
    const y = pin.y + i * TAIL_SEGMENT;
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
    dry: false,
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
  if (reel) kite.len = max(STRING_MIN, kite.len - STRING_REEL * dt);
  else if (kite.len < STRING_BASE) kite.len = min(STRING_BASE, kite.len + STRING_PAYOUT * dt);
};

/** Direction of the wind's push: up (leaning to the centre) bent by the stick. */
const aeroDirection = (kite, { ax, ay }) => {
  const [sx, sy] = unit(ax, ay);
  const inward = sign(W / 2 - kite.anchor.x);
  return unit(sin(KITE_LEAN) * inward * KITE_CLIMB + sx, -cos(KITE_LEAN) * KITE_CLIMB + sy);
};

/** A taut line turns the wind into a full push, a slack one only part of it; TURBO pushes harder still. */
const accelerate = (kite, input, weather, dt) => {
  const [dx, dy] = aeroDirection(kite, input);
  const boost = kite.tug > 0 ? DASH_TUG_WIND : kite.holding ? AIR_WIND : 0;
  const wind = max(weather.wind, boost);
  const push = KITE_AERO * wind * (kite.taut || boost > 0 ? 1 : KITE_SLACK_AERO) * (kite.turbo ? POWER_PUSH : 1);
  kite.vx += (dx * push + weather.gust) * dt;
  kite.vy += (dy * push + KITE_GRAVITY) * dt;
};

/** JALAR: a burst along the stick (none when centred) plus an upward tug that fights a calm. */
const dash = (kite, { ax, ay }) => {
  const [sx, sy] = unit(ax, ay);
  kite.vx += sx * DASH_BURST;
  kite.vy += sy * DASH_BURST - DASH_LIFT;
  kite.tug = DASH_TUG;
  kite.air -= AIR_PRESS;
};

/** Whether a JALAR press would fire now. */
const canPull = (kite) => kite.air >= AIR_PRESS;

/** How a player who watches the meter holds B1: lets go when AIRE runs out, holds again once it allows a press. */
const keepHolding = (wants, holding, kite) => wants && kite.air > 0 && (holding || canPull(kite));

/** Holding B1 keeps the tug's lift on while AIRE lasts; otherwise the meter refills. TURBO keeps it full. */
const holdLift = (kite, hold, dt) => {
  if (!hold || canPull(kite)) kite.dry = false;
  kite.holding = hold && kite.air > 0 && !kite.dry;
  if (kite.turbo) kite.air = 1;
  else if (kite.holding) {
    kite.air = max(0, kite.air - AIR_DRAIN * dt);
    kite.dry = !kite.air;
  } else kite.air = min(1, kite.air + AIR_REFILL * dt);
};

/** The screen edges stop a kite dead: no speed is left pushing into them, so it never sticks there. */
const keepOnScreen = (kite) => {
  const x = min(W - KITE_RADIUS, max(KITE_RADIUS, kite.x));
  if (x !== kite.x) kite.vx = 0;
  if (kite.y < KITE_RADIUS) kite.vy = max(0, kite.vy);
  kite.x = x;
  kite.y = max(KITE_RADIUS, kite.y);
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
const follow = (point, leader, link = TAIL_SEGMENT) => {
  const gap = distance(point, leader) || 1;
  point.x = leader.x + ((point.x - leader.x) * link) / gap;
  point.y = leader.y + ((point.y - leader.y) * link) / gap;
};

/** Verlet tail hanging from the kite, swayed by the gusts; each point records its velocity for cuts. */
const stepTail = (kite, weather, dt) => {
  const [pin, ...rest] = kite.tail;
  assign(pin, tailPin(kite), { vx: kite.vx, vy: kite.vy });
  for (const point of rest) {
    const vx = (point.x - point.px) * TAIL_DAMPING;
    const vy = (point.y - point.py) * TAIL_DAMPING;
    point.px = point.x;
    point.py = point.y;
    point.x += vx + weather.gust * TAIL_WIND_DRAG * dt * dt;
    point.y += vy + TAIL_GRAVITY * dt * dt;
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
  const damping = exp(-KITE_DRAG * dt);
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
  kite.y = lerp(SPAWN_Y, kite.anchor.y - RESPAWN_LOW, kite.respawn / RESPAWN_CLIMB);
  kite.len = kite.anchor.y - kite.y;
  if (!kite.respawn) kite.guard = RESPAWN_GUARD;
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
  const speeds = kite.tail.slice(TAIL_BLADE_FROM, TAIL_SEGMENTS).map((point, i) => {
    const crosses = segmentsIntersect(point, kite.tail[TAIL_BLADE_FROM + i + 1], rival.anchor, rival);
    return crosses ? sweepSpeed(point, rival) : 0;
  });
  const fastest = max(...speeds);
  return fastest > SWEEP_SPEED ? fastest : 0;
};

// ---------------------------------------------------------------------------
// 6. Duel rules (pure)
// ---------------------------------------------------------------------------

const ZAMURO_BAND = [140, 380];
const ZAMURO_EVERY = [5, 9];
const RULES = ['tiempo', 'vidas'];
// One full cycle of gusts and calms every 10 s.
const WIND_CYCLE = TAU / 10;
// How deep the lulls swing (the duel's `lull`): gentle against the first rival, full against the last.
const LULLS_LADDER = [0.56, 0.6, 0.63, 0.65, 0.67, 0.68];
// Power boxes: one every `every` s (at most `max` around), drifting `drift` × the gust, gone after `life` s.
const POWERS = ['vidrio', 'turbo', 'nylon', 'zamuro'];
const BOX_EVERY = [10, 14];
const BOX_X = [260, 540];
const BOX_BAND = [150, 340];

const powerLineY = (x) => {
  const t = (x - POWER_LINE_FROM) / (POWER_LINE_TO - POWER_LINE_FROM);
  return POWER_LINE_Y + POWER_LINE_SAG * 4 * t * (1 - t);
};

/** 'line' when the kite touches the wires, 'ground' when it sinks onto the rooftops. */
const crashCause = ({ x, y }) => {
  const overStreet = x >= POWER_LINE_FROM && x <= POWER_LINE_TO;
  if (overStreet && abs(y - powerLineY(x)) < KITE_RADIUS + POWER_LINE_HALF) return 'line';
  if (y + KITE_RADIUS > ROOF_Y) return 'ground';
  return null;
};

/** Weather at match time `at`: deterministic, so the screen can warn about what comes next. */
const weatherAt = (duel, at = duel.elapsed) => {
  const [cycle, flutter, side] = duel.windPhases;
  return {
    wind: max(0, 1 + duel.lull * sin(at * WIND_CYCLE + cycle) + WIND_FLUTTER * sin(at * WIND_FLUTTER_RATE + flutter)),
    gust: KITE_GUST * sin(at * WIND_GUST_RATE + side),
  };
};

/** 'calma' or 'rafaga' while one is on or due within the warning lead; null in steady wind. */
const windCue = (duel) => {
  const winds = [duel.elapsed, duel.elapsed + WIND_LEAD].map((at) => weatherAt(duel, at).wind);
  if (winds.some((wind) => wind < WIND_LULL)) return 'calma';
  if (winds.some((wind) => wind > WIND_RAFAGA)) return 'rafaga';
  return null;
};

const ladderLull = (level) => LULLS_LADDER[level];

/** TIEMPO (against the clock) rather than VIDAS. */
const isTimed = ({ rules }) => rules === 'tiempo';

// The wind cycle starts just below steady and rising, so a match opens with a few seconds of normal wind.
const createDuel = (rng, rules = 'tiempo', lull = LULLS_VERSUS) => ({
  rng,
  rules,
  lull,
  phase: 'countdown',
  clock: MATCH_COUNTDOWN,
  elapsed: 0,
  grace: 0,
  winner: null,
  score: [0, 0],
  lives: [MATCH_LIVES, MATCH_LIVES],
  kites: [createKite(0), createKite(1)],
  zamuros: [],
  boxes: [],
  nextZamuro: between(rng, ZAMURO_EVERY),
  nextBox: between(rng, BOX_EVERY),
  windPhases: [-rng() * WIND_OPENING, rng() * TAU, rng() * TAU],
});

/** A fresh kite in the kid's hands, about to rise. */
const respawnKite = (player) => {
  const kite = assign(createKite(player), { respawn: RESPAWN_CLIMB });
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
  if (due(duel, 'nextZamuro', ZAMURO_EVERY, dt)) {
    const direction = rng() < 0.5 ? 1 : -1;
    const x = direction > 0 ? -ZAMURO_MARGIN : W + ZAMURO_MARGIN;
    duel.zamuros.push({ x, y: between(rng, ZAMURO_BAND), vx: direction * ZAMURO_SPEED, vy: 0, hit: [false, false] });
  }
  if (due(duel, 'nextBox', BOX_EVERY, dt) && duel.boxes.length < BOX_MAX) {
    duel.boxes.push({ x: between(rng, BOX_X), y: between(rng, BOX_BAND), kind: POWERS[floor(rng() * POWERS.length)], life: BOX_LIFE });
  }
};

/** Wild zamuros fly straight across; an allied one (with a `prey`) chases the rival kite until its life ends. */
const flyZamuro = (duel, zamuro, dt) => {
  if ('prey' in zamuro) {
    const prey = duel.kites[zamuro.prey];
    [zamuro.vx, zamuro.vy] = unit(prey.x - zamuro.x, prey.y - zamuro.y).map((v) => v * POWER_ALLY);
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
  duel.zamuros = duel.zamuros.filter(({ x, life = 1 }) => life > 0 && x > -ZAMURO_MARGIN - 1 && x < W + ZAMURO_MARGIN + 1);
  duel.boxes.forEach((box) => {
    box.x += weather.gust * BOX_DRIFT * dt;
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
      const ally = 'prey' in zamuro;
      if (zamuro.hit[player] || (ally && zamuro.prey !== player) || !vulnerable(kite)) return;
      if (distance(zamuro, kite) > ZAMURO_RADIUS + KITE_RADIUS) return;
      zamuro.hit[player] = true;
      kite.stun = ally ? POWER_STUN : STUN;
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
  else if (kind === 'zamuro') duel.zamuros.push({ x: kite.anchor.x, y: ROOF_Y, vx: 0, vy: 0, hit: [false, false], prey: 1 - player, life: POWER_ALLY_LIFE });
  else kite[kind] = kind === 'vidrio' ? POWER_VIDRIO : POWER_TURBO;
};

/** A flying kite that touches a box takes its power; returns the pickup events. */
const collect = (duel) => {
  const events = [];
  duel.boxes = duel.boxes.filter((box) => {
    const player = duel.kites.findIndex((kite) => !kite.respawn && distance(kite, box) < BOX_RADIUS + KITE_RADIUS);
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
    kite.fray = speed ? (cutter.vidrio ? FRAY_TOUGHNESS : kite.fray + speed * dt) : max(0, kite.fray - FRAY_RECOVERY * dt);
    return kite.fray >= FRAY_TOUGHNESS;
  });
};

/** Both strings snapping in the same step cancel out: the kites bounce apart and both strings half-heal. */
const clash = (duel) => {
  const [a, b] = duel.kites;
  a.fray /= 2;
  b.fray /= 2;
  const [nx, ny] = unit(a.x - b.x, a.y - b.y);
  a.vx += nx * CLASH_BOUNCE;
  a.vy += ny * CLASH_BOUNCE;
  b.vx -= nx * CLASH_BOUNCE;
  b.vy -= ny * CLASH_BOUNCE;
  duel.grace = CLASH_GRACE;
  return { type: 'clash' };
};

/** Scores a lost kite (twice in TIEMPO's last seconds) and replaces it; the event carries the lost kite. */
const award = (duel, loser, cause) => {
  const winner = 1 - loser;
  const value = isTimed(duel) && duel.elapsed > MATCH_TIME - MATCH_DOUBLE ? 2 : 1;
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
  if (elapsed < MATCH_TIME || score[0] === score[1]) return null;
  return score[0] > score[1] ? 0 : 1;
};

const flyStep = (duel, inputs, dt) => {
  const before = duel.elapsed;
  duel.elapsed += dt;
  duel.grace = max(0, duel.grace - dt);
  spawn(duel, dt);
  const events = [...advanceWorld(duel, inputs, dt), ...stunKites(duel), ...collect(duel), ...resolve(duel, dt)];
  const reached = (mark) => isTimed(duel) && before < mark && duel.elapsed >= mark;
  if (reached(MATCH_TIME - MATCH_DOUBLE)) events.push({ type: 'double' });
  if (reached(MATCH_TIME) && duel.score[0] === duel.score[1]) events.push({ type: 'sudden' });
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
  rival('EL CHAMO', 'CATIA, CARACAS', '¡QUÉ LO QUÉ, PANA!', [0.75, 100, 0, 0, 410, 0.7, 0.6, 0, 0.62, 0.1]),
  rival('LA GOCHA', 'MÉRIDA', '¡AY, QUÉ FRÍO, MIJO!', [0.6, 80, 40, 0.15, 405, 0.5, 0.7, 25, 0.76, 0.2]),
  rival('EL GUARO', 'BARQUISIMETO', '¡GUARO, TE VOY A CORTAR!', [0.47, 45, 70, 0.3, 420, 0.27, 0.8, 50, 1, 0.3]),
  rival('LA MARGARITEÑA', 'MARGARITA', '¡AY, VALE, QUÉ BRISA!', [0.3, 20, 80, 0.4, 410, 0.25, 0.9, 90, 1, 0.4]),
  rival('EL MARACUCHO', 'MARACAIBO', '¡QUÉ MOLLEJA DE PAPAGAYO!', [0.14, 7, 90, 0.45, 400, 0.2, 1, 100, 1, 0.5]),
  rival('DON GOYO', 'EL VALLE, CARACAS', 'CUARENTA AÑOS CORTANDO PAPAGAYOS', [0.1, 5, 110, 0.9, 420, 0, 1, 100, 1, 0.6]),
];

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
  x: rival.x + (rival.anchor.x - rival.x) * CPU_STRIKE_ALONG,
  y: rival.y + (rival.anchor.y - rival.y) * CPU_STRIKE_ALONG - BLADE_DEPTH,
});

/** Aims past the strike point on the far side of the string, so the blade saws across it. */
const sawPoint = (me, rival, stroke) => {
  const strike = strikePoint(rival);
  const [nx, ny] = stringNormal(rival);
  const side = (me.x - strike.x) * nx + (me.y - strike.y) * ny < 0 ? 1 : -1;
  return { x: strike.x + side * nx * stroke, y: strike.y + side * ny * stroke };
};

const threatened = (me, rival) => pointSegmentDistance(rival.tail[TAIL_SEGMENTS], me.anchor, me) < CPU_THREAT;

/** Where a kite flies safest: straight above its own anchor, on the end of its line. */
const retreatPoint = (kite) => ({ x: kite.anchor.x, y: kite.anchor.y - kite.len });

const sinking = (cpu, duel, me) => {
  const heeds = cpu.rng() < cpu.spec.foresight;
  const calm = heeds ? windCue(duel) === 'calma' : weatherAt(duel).wind < WIND_LULL;
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
  cpu.lifting = cpu.climbing && (weatherAt(duel).wind < WIND_LULL || me.y > cpu.spec.nerve);
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
    y: min(CPU_FLOOR, aim.y + gaussian(rng) * spec.aim),
  };
  cpu.dash = distance(me, cpu.target) < spec.dashRange;
};

const axis = (delta) => (abs(delta) < CPU_DEADZONE ? 0 : sign(delta));

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

const createStats = () => [0, 1].map(() => ({ cuts: 0, crashes: 0, dashes: 0 }));

/** Adds one duel event to the per-player CORTES / CHOQUES / JALONES counters. */
const tally = (stats, { type, cause, winner, loser, player }) => {
  if (type === 'dash') stats[player].dashes += 1;
  if (type !== 'point' || winner === null) return;
  if (cause === 'cut') stats[winner].cuts += 1;
  else stats[loser].crashes += 1;
};

/** Points the human (player 0) earns for a point. */
const pointScore = ({ cause, winner, value }) => (winner === 0 ? (cause === 'cut' ? SCORE_CUT : SCORE_CRASH) * value : 0);

const matchBonus = (winner, score, level) =>
  winner === 0 ? SCORE_WIN * (level + 1) + (score[1] === 0 ? SCORE_FLAWLESS : 0) : 0;

const ladderOutcome = (winner, level) => {
  if (winner !== 0) return 'defeat';
  return level === RIVALS.length - 1 ? 'champion' : 'next';
};

const AvatarStore = {
  load: async () => sanitizeChoices(await storage.get(AVATAR_KEY)),
  save: (choices) => storage.set(AVATAR_KEY, choices),
};

/** Cycles an initial through A-Z, wrapping at both ends. */
const shiftLetter = (letter, step) =>
  String.fromCharCode(65 + ((((letter.charCodeAt(0) - 65 + step) % LETTER_COUNT) + LETTER_COUNT) % LETTER_COUNT));

// ---------------------------------------------------------------------------
// 9. Avatars (pure)
// ---------------------------------------------------------------------------

const SKINS = [0xf3cfa6, 0xd9a173, 0xa8693f, 0x6b4126];
const SHIRTS = [0xffd23f, 0x3fd2ff, 0xe8432e, 0x2fbf71, 0xe83e9b, 0xf2f2f2];
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

/** A look as drawn: body and hair indices, skin and shirt colours, size, kite and hair colour. */
const look = (body, hair, skin, shirt, scale, kite, hairTone = HAIR_TONES_DARK) => ({ body, hair, skin, shirt, hairTone, scale, kite });

/** What a player's choice looks like on screen. */
const resolveLook = (choice, player) =>
  look(choice.body, choice.hair, SKINS[choice.skin], SHIRTS[choice.shirt], 1, kiteOf(PLAYER_COLORS[player], KITE_DESIGNS[choice.kite]));

// The six regional rivals, by ladder level (hair indices beyond the players' are the rivals' own).
const RIVAL_LOOKS = [
  look(0, 1, SKINS[2], 0x2fbf71, 0.96, kiteOf(0x2fbf71, ['001001', WHITE])),
  look(1, 4, SKINS[0], 0x8a3a8a, 0.98, kiteOf(0xe8432e, ['011011', 0x2b3a8f])),
  look(0, 5, SKINS[1], 0xd8323c, 1.04, kiteOf(0xd8323c, ['000111', 0xffd23f])),
  look(1, 6, SKINS[2], 0x2ec4b6, 1, kiteOf(0x2ec4b6, ['010101', WHITE])),
  look(0, 7, SKINS[1], 0x2f6fd6, 1.12, kiteOf(0x2f6fd6, ['001001', 0xffd23f])),
  look(2, 8, SKINS[2], 0xf2ead8, 1.16, kiteOf(0xff8a1f, ['010101', 0x1c1c1c]), HAIR_TONES_WHITE),
];

const isSolo = (mode) => mode === 'solo';
const playersOf = (mode) => (isSolo(mode) ? [0] : [0, 1]);

/**
 * Who stands on each azotea, with the name the screen gives them: in solo the human (TÚ) against the rival of
 * that ladder level, in versus both players as customised. Every scene pairs names and looks through this.
 */
const lineup = (mode, level, choices) =>
  isSolo(mode)
    ? [{ name: 'TÚ', look: resolveLook(choices[0], 0) }, { name: RIVALS[level].name, look: RIVAL_LOOKS[level] }]
    : [0, 1].map((player) => ({ name: `JUGADOR ${player + 1}`, look: resolveLook(choices[player], player) }));

const looksOf = (cast) => cast.map(({ look }) => look);
const namesOf = (cast) => cast.map(({ name }) => name);

// ---------------------------------------------------------------------------
// 10. Art direction (pure)
// ---------------------------------------------------------------------------

// Faded street paper, never as saturated as the tail bows.
const PAPELITOS = [0xc79a8c, 0x93a7b3, 0xd3c29a, 0xae96ab];

// Sky stops from the top down to the horizon: a fixed Caracas sunset.
const SKY = [0x2b1640, 0x7a2f5b, 0xe2683c, 0xffb347];

/** Linear blend of two 0xRRGGBB colours. */
const mixColor = (from, to, t) => {
  const channel = (shift) => {
    const a = (from >> shift) & 0xff;
    return round(a + (((to >> shift) & 0xff) - a) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
};

/** How the wind looks (px/s) on the papelitos. */
const windDrift = ({ wind, gust }) => ({ vx: wind * (BREEZE_SPEED + gust * BREEZE_GUST), vy: BREEZE_SINK * (1 - wind) });

/** Belly of a string at its middle (px): nearly straight when taut, loose when slack. */
const stringSag = (kite) =>
  kite.taut ? SAG_TAUT : min(SAG_MAX, SAG_TAUT + (kite.len - distance(kite, kite.anchor)) * SAG_SLACK);

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

/** A copy of a cut kite (with its tail) that can fall without touching the duel. */
const createFall = ({ x, y, vx, vy, tail }) => ({ x, y, vx, vy, spin: 0, tail: tail.map((point) => ({ ...point })) });

const stepFall = (fall, weather, dt) => {
  const damping = exp(-FALL_DRAG * dt);
  fall.vx = (fall.vx + weather.gust * FALL_DRIFT * dt) * damping;
  fall.vy = (fall.vy + FALL_GRAVITY * dt) * damping;
  fall.x += fall.vx * dt;
  fall.y += fall.vy * dt;
  fall.spin += FALL_SPIN * dt * sign(fall.vx || 1);
  stepTail(fall, weather, dt);
};

// ---------------------------------------------------------------------------
// 11. Pixel art: font and backdrop painters (baked once at screen resolution)
// ---------------------------------------------------------------------------

// 5×7 glyphs, one base-32 digit per row (bit 4 is the left column); accented capitals reuse their base letter
// with a mark in the two rows above. Baked with a one-pixel ink outline, so tinting keeps it readable anywhere.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?¡¿.,:·-/×()+‹› ';
const GLYPH_ROWS =
  'ehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhhe44444e72222ichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhlllahha4ahhhha4444v1248gvehjlphe4c4444eeh1248vv2421he26aiv22vgu11he68guhhev124888ehhehheehhf12c4444404eh1240440444444048ghe00000cc0000c480cc0cc0000cc00000e00011248gg0ha4ah024888428422248044v440024842008424800000000';
const ACCENTS = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };
// The mark above an accented letter, as [x, y] pixels in the two rows over the glyph.
const MARKS_ACUTE = [[3, 0], [2, 1]];
const MARKS_TILDE = [[1, 0], [2, 0], [4, 0], [0, 1], [2, 1], [3, 1]];
const FONT_KEY = 'pixel-font';
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
  if (base !== char) (char === 'Ñ' ? MARKS_TILDE : MARKS_ACUTE).forEach(([x, y]) => pixels.push([1 + x, 1 + y]));
  return pixels;
};

const rgba = (color, alpha = 1) => `rgba(${color >> 16},${(color >> 8) & 255},${color & 255},${alpha})`;

/** Fills whole pixels: painters only draw axis-aligned rectangles, so nothing is ever antialiased. */
const fill = (ctx, color, x, y, w = 1, h = 1, alpha = 1) => {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillRect(round(x), round(y), round(w), round(h));
};

/** Every character in white with an ink outline, in rows of FONT_PER_ROW cells. */
const paintFont = (ctx) =>
  [INK, WHITE].forEach((color, pass) =>
    [...FONT_CHARS].forEach((char, i) => {
      const x = (i % FONT_PER_ROW) * FONT_CELL;
      const y = floor(i / FONT_PER_ROW) * FONT_HEIGHT;
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
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return;
  const columns = FONT_PER_ROW * FONT_CELL;
  const image = bake(scene, FONT_KEY, columns, ceil(FONT_CHARS.length / FONT_PER_ROW) * FONT_HEIGHT, paintFont);
  const font = Phaser.GameObjects.RetroFont.Parse(scene, {
    image,
    width: FONT_CELL,
    height: FONT_HEIGHT,
    chars: FONT_CHARS,
    charsPerRow: FONT_PER_ROW,
    spacing: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
  });
  // Outlines of neighbouring letters overlap by a pixel, as on old arcade boards.
  Object.values(font.data.chars).forEach((char) => (char.xAdvance = FONT_ADVANCE));
  scene.cache.bitmapFont.add(FONT_KEY, font);
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

const paintSun = (ctx) => SUN_RINGS.forEach(([r, color, alpha]) => disc(ctx, color, SUN_SIZE / 2, SUN_SIZE / 2, r, alpha));

// El Ávila, far crest then the main crest with the Hotel Humboldt and the teleférico (pixels), each as
// [colour, shade, rim, base, peak, centre, spread, rough, landmarks?]; `RIDGE_DEPTHS` is how much each slides.
const RIDGES = [
  [0x8c6a98, 0x7a5b8a, 0xe0a0a8, 200, 104, 280, 180, 0.5],
  [0x58397a, 0x462e64, 0xff9a84, 228, 118, 190, 150, 0.7, true],
];
const RIDGE_DEPTHS = [0.02, 0.04];
const CABLE_CAR_CABINS = [0.3, 0.55, 0.8];

/** The Hotel Humboldt: a white round tower with banded floors and a crown, on the summit. */
const paintHumboldt = (ctx, x, y) => {
  fill(ctx, HUMBOLDT_BODY, x - 3, y - 15, 7, 16);
  for (let floorY = y - 13; floorY < y; floorY += 3) fill(ctx, HUMBOLDT_BAND, x - 3, floorY, 7, 1);
  fill(ctx, HUMBOLDT_BODY, x - 4, y - 17, 9, 2);
  fill(ctx, INK, x, y - 23, 1, 6);
};

/** The teleférico from the valley up to the summit: a sagging cable, pylons and red cabins. */
const paintCableCar = (ctx, [x0, y0], [x1, y1]) => {
  const at = (t) => [lerp(x0, x1, t), lerp(y0, y1, t) + 10 * t * (1 - t)];
  for (let t = 0; t < 1; t += 0.004) fill(ctx, INK, ...at(t));
  [0.2, 0.65].forEach((t) => fill(ctx, INK, at(t)[0], at(t)[1], 1, 7));
  CABLE_CAR_CABINS.forEach((t) => {
    const [x, y] = at(t);
    fill(ctx, INK, x, y, 1, 2);
    fill(ctx, CABLE_CAR_COLOR, x - 2, y + 2, 5, 4);
    fill(ctx, CREAM, x - 1, y + 3, 3, 1);
  });
};

/** One crest of El Ávila: column fills under a flat-topped, roughened crest, with quebradas running down. */
const paintRidge = ([color, shade, rim, base, peak, centre, spread, rough, landmarks]) => (ctx, rng) => {
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
  const foot = floor(WIDE * CABLE_CAR_FROM);
  paintCableCar(ctx, [foot, crest[foot] + 6], [summit - 6, crest[summit] - 4]);
};

// Ranchos are painted fronts with a darker roof line; some windows already glow at sunset.
const RANCHOS = [0xc0603e, 0xd27d4e, 0xe8a85a, 0xd96a8a, 0x5aa0c8, 0x8bc06a, 0xe6d26a, 0xb07ac8];

/** A window: dark glass, or already lit by a fixed pattern. */
const pane = (ctx, x, y, w = 1, h = 1) => fill(ctx, (x * 7 + y * 13) % 9 ? DARK_GLASS : WINDOW_LIT, x, y, w, h);

/** A cerro on one edge of the valley, covered top to bottom in colourful ranchos. */
const paintCerro = (ctx, rng, side) => {
  const edge = side ? WIDE : 0;
  const inward = side ? -1 : 1;
  const hill = (x) => CERROS_FOOT - CERROS_RISE * max(0, 1 - abs(x - edge) / CERROS_REACH) ** 1.3;
  for (let i = 0; i <= CERROS_REACH; i += 1) fill(ctx, 0x3a2240, edge + inward * i, hill(edge + inward * i) - 3, 1, PH);
  range(CERROS_RANCHOS, () => {
    const x = floor(edge + inward * rng() * CERROS_REACH);
    return { x, y: floor(between(rng, [hill(x), CERROS_FOOT + 6])), w: 5 + floor(rng() * 5), h: 4 + floor(rng() * 3) };
  })
    .sort((a, b) => a.y - b.y)
    .forEach(({ x, y, w, h }) => {
      fill(ctx, RANCHOS[floor(rng() * RANCHOS.length)], x, y - h, w, h);
      fill(ctx, RANCHO_ROOF, x - 1, y - h - 1, w + 2, 1);
      pane(ctx, x + 1 + floor(rng() * (w - 2)), y - h + 2);
    });
};

/** The mid-distance city: the cerros of ranchos on both sides, leaving El Ávila open in the middle. */
const paintCity = (ctx, rng) => [0, 1].forEach((side) => paintCerro(ctx, rng, side));

const CABLES = [-7, 0, 7];

/** Wooden poles with crossbars and three sagging cables, stepped pixel by pixel. */
const paintWires = (ctx) => {
  const [from, to] = [POWER_LINE_FROM, POWER_LINE_TO].map((x) => x / PIXEL);
  [from, to].forEach((x) => {
    fill(ctx, WIRE, x - 2, POLE_TOP, 4, PH);
    fill(ctx, WIRE, x - POLE_BAR / 2, POLE_TOP + 3, POLE_BAR, 2);
  });
  CABLES.forEach((offset) => {
    for (let x = from; x <= to; x += 1) fill(ctx, WIRE, x, (powerLineY(x * PIXEL) + offset) / PIXEL);
  });
};

// Per-player rooftop clutter as [wall colour, then x offsets (pixels) from the anchor of the water tank, an
// antenna or a dish].
const ROOFTOPS = [
  [0x6a3a4a, -24, -33],
  [0x7a4a3a, 31, 0, 15],
];

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
  fill(ctx, TANK_BODY, x - 7, roof - 19, 14, 13);
  fill(ctx, TANK_LIGHT, x - 4, roof - 19, 2, 13);
  fill(ctx, TANK_DARK, x - 8, roof - 21, 16, 2);
};

/** The two flyers' azoteas with their clutter, the blocks under the cables and frame blocks at the edges. */
const paintAzoteas = (ctx, rng) => {
  const roof = ROOF_Y / PIXEL;
  const deck = DECK / PIXEL;
  for (let x = POWER_LINE_FROM / PIXEL; x < POWER_LINE_TO / PIXEL - 15; x += 25 + floor(rng() * 5)) {
    paintBlock(ctx, x, 274 + rng() * 13, 23, 0x4a2a44);
  }
  paintBlock(ctx, -5, 226, 36, 0x3e2440);
  paintBlock(ctx, PW - 32, 231, 37, 0x3e2440);
  ANCHORS.forEach(({ x: anchor }, player) => {
    const x = anchor / PIXEL;
    const [wall, tank, antenna, dish] = ROOFTOPS[player];
    paintBlock(ctx, x - AZOTEA_HALF, deck, AZOTEA_HALF * 2, wall);
    fill(ctx, mixColor(wall, CREAM, 0.15), x - AZOTEA_HALF - 2, roof - 2, AZOTEA_HALF * 2 + 4, deck - roof + 2);
    fill(ctx, CREAM, x - AZOTEA_HALF - 2, roof - 3, AZOTEA_HALF * 2 + 4, 1);
    fill(ctx, INK, x - AZOTEA_HALF - 2, deck - 1, AZOTEA_HALF * 2 + 4, 1);
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
const paintPixel = (ctx) => fill(ctx, WHITE, 0, 0, 1, 1);

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
    scene.add.image(SUN_X, SUN_Y, bake(scene, 'sun', SUN_SIZE, SUN_SIZE, paintSun)).setScale(PIXEL).setBlendMode('ADD');
    this.parallax = [...RIDGES.map((ridge, i) => [image(`ridge-${i}`, paintRidge(ridge), WIDE), RIDGE_DEPTHS[i]]), [image('city', paintCity, WIDE), CITY_DEPTH]];
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

/** Papelitos and dust that make the wind visible: they streak in gusts and flutter down in calms. */
class WindParticles {
  constructor() {
    const rng = makeRng(7);
    this.items = range(WIND_PARTICLES_COUNT, () => ({
      x: rng() * W,
      y: between(rng, [WIND_PARTICLES_TOP, WIND_PARTICLES_BOTTOM]),
      pace: 0.6 + rng() * 0.8,
      spin: rng() * TAU,
      dust: rng() < 0.4,
      color: PAPELITOS[floor(rng() * PAPELITOS.length)],
    }));
  }

  update(drift, dt) {
    for (const item of this.items) {
      item.spin += dt * (2 + abs(drift.vx) * 0.02);
      item.x = ((item.x + drift.vx * item.pace * dt + W + 80) % (W + 80)) - 40;
      item.y += (drift.vy * item.pace + sin(item.spin) * 14) * dt;
      if (item.y > WIND_PARTICLES_BOTTOM) item.y = WIND_PARTICLES_TOP;
      if (item.y < WIND_PARTICLES_TOP) item.y = WIND_PARTICLES_BOTTOM;
    }
  }

  draw(g, drift) {
    const streaks = hypot(drift.vx, drift.vy) > WIND_PARTICLES_STREAK;
    this.items.forEach(({ x, y, pace, spin, dust, color }) => {
      if (streaks) {
        const trace = WIND_PARTICLES_TRACE * pace;
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

// One-pixel ink outline around every figure: the figure drawn in ink, nudged one pixel each way.
const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Per-player art state: the kid's look and animation, and the tumble of a kite it just lost. */
class Flyer {
  constructor(player, look) {
    assign(this, { player, look, side: player ? -1 : 1, clock: 0, yank: 0, holding: false, lift: 0, cheerTime: 0, fall: null });
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
    this.lift = this.mood === 'win' ? abs(sin(this.clock * 9)) * KID_JUMP : 0;
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
    return { x: anchor.x - side * KID_BACK, y: KID_FOOT, scale: KID_SCALE, side, mood, expression, lift, yank, clock, hand: this.hand({ anchor }) };
  }
}

/** Cap of hair over the top of the head, shared by most styles. */
const hairCap = (g, x, y, tone) => g.fillStyle(tone).fillEllipse(x, y - 5, 22, 12);

// One painter per hair style (indices as in HAIRS_BY_BODY, then the rivals'), drawn over the head:
// (g, head x, head y, side, hair tone, dye, clock). `dye` turns a fixed colour into ink for the outline pass.
const HAIR_PAINTERS = [
  (g, x, y, s, tone) => hairCap(g, x, y, tone).fillRect(x - s * 10 - 1.5, y - 6, 3, 7),
  (g, x, y, s, tone, dye) => g.fillStyle(dye(HEADGEAR_CAP)).fillEllipse(x, y - 5, 23, 13).fillRect(min(x - s * 8, x - s * 18), y - 7, 10, 3),
  (g, x, y, s, tone, dye, clock) =>
    hairCap(g, x, y, tone)
      .fillEllipse(x - s * 13, y + 1 + sin(clock * 4) * 2, 8, 17)
      .fillStyle(dye(HEADGEAR_CAP))
      .fillCircle(x - s * 10, y - 5, 2.5),
  (g, x, y, s, tone) => hairCap(g, x, y, tone).fillCircle(x - s * 2, y - 13, 6),
  // LA GOCHA: a striped ruana over the shoulders and a wool hat with a pompom.
  (g, x, y, s, tone, dye) => {
    const poncho = [[-10, 12], [10, 12], [18, 42], [-18, 42]].map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
    g.fillStyle(dye(HEADGEAR_RUANA)).fillPoints(poncho, true).fillStyle(dye(HEADGEAR_STRIPE)).fillRect(x - 16, y + 32, 32, 3);
    hairCap(g, x, y, tone).fillStyle(dye(HEADGEAR_WOOL)).fillEllipse(x, y - 7, 23, 14).fillStyle(dye(HEADGEAR_CAP)).fillCircle(x, y - 15, 4);
  },
  // EL GUARO: a mop of curls.
  (g, x, y, s, tone) => [-8, -4, 0, 4, 8, -5, 2].forEach((ox, i) => g.fillStyle(tone).fillCircle(x + ox, y - (i < 5 ? 6 : 11), 5)),
  // LA MARGARITEÑA: long hair down her back with a flower.
  (g, x, y, s, tone, dye) =>
    hairCap(g, x, y, tone)
      .fillRect(min(x - s * 3, x - s * 13), y - 6, 10, 24)
      .fillStyle(dye(HEADGEAR_FLOWER))
      .fillCircle(x - s * 7, y - 8, 3.5),
  // EL MARACUCHO: spiky hair.
  (g, x, y, s, tone) => {
    [-7, -2, 3, 8].forEach((ox) => g.fillStyle(tone).fillTriangle(x + ox - 4, y - 6, x + ox + 4, y - 6, x + ox - s * 2, y - 15));
    hairCap(g, x, y, tone);
  },
  // DON GOYO: white sideburns under a sombrero.
  (g, x, y, s, tone, dye) => {
    g.fillStyle(tone).fillRect(x - s * 10 - 1.5, y - 7, 3, 7);
    g.fillStyle(dye(HEADGEAR_HAT)).fillRoundedRect(x - 8, y - 19, 16, 11, 4).fillEllipse(x, y - 8, 34, 7);
    rect(g, dye(HEADGEAR_BAND), x - 8, y - 11, 16, 2);
  },
];

/** Face toward the kite, in blocky pixels: eyes, brows and mouth for the mood (focus, effort, win, lose). */
const drawFace = (g, { x, y }, side, expression, old) => {
  const ex = x + side * 2;
  const eyes = [ex - 4, ex + 3];
  const brow = { focus: 1, effort: 2, win: -1, lose: -2 }[expression];
  g.fillStyle(FACE_INK);
  eyes.forEach((eye, i) => g.fillRect(eye - 1, y - 6 + (i ? brow : -brow), 3, 1.5));
  // Eyes squint to a line when winning or straining, and stay open otherwise.
  const squint = { win: 2, effort: 1 }[expression];
  eyes.forEach((eye) => (squint ? g.fillRect(eye - 1, y - squint, 3, 1.5) : g.fillRect(eye, y - 3, 2, 3)));
  if (expression === 'win') {
    g.fillRect(ex - 4, y + 2, 8, 4).fillStyle(WHITE).fillRect(ex - 3, y + 2, 6, 1.5);
    rect(g, FACE_BLUSH, ex - 8, y, 3, 2).fillRect(ex + 6, y, 3, 2);
  } else if (expression === 'effort') {
    g.fillRect(ex - 3, y + 3, 6, 3).fillStyle(WHITE).fillRect(ex - 3, y + 3, 6, 1.5);
    // A drop of sweat at the temple, pointed on top.
    const temple = ex + side * 7;
    g.fillStyle(FACE_TEAR).fillTriangle(temple, y - 10, temple - 2, y - 5, temple + 2, y - 5);
  } else if (expression === 'lose') {
    g.fillRect(ex - 3, y + 4, 6, 1.5).fillRect(ex - 4, y + 5.5, 2, 1.5).fillRect(ex + 2, y + 5.5, 2, 1.5);
    rect(g, FACE_TEAR, eyes[1], y, 2, 4);
  } else g.fillRect(ex - 2, y + 4, 4, 1.5);
  if (old) rect(g, HAIR_TONES_WHITE, ex - 5, y + 2, 10, 3);
};

/** One pass of a figure in local units: in its own colours with its face, or all in ink for an outline pass. */
const paintFigure = (g, look, pose, hand, ink) => {
  const { side: s, mood, lift, yank } = pose;
  const chama = look.body === 1;
  const old = look.body === 2;
  const dye = (color) => (ink ? INK : color);
  const skin = dye(look.skin);
  const cloth = dye(look.shirt);
  const pants = dye(chama ? mixColor(look.shirt, INK, 0.45) : PANTS);
  const slump = mood === 'lose' ? KID_SLUMP : 0;
  const hunch = old ? FIGURE_HUNCH : 0;
  const lean = -s * yank * 5 + s * hunch;
  const hip = FIGURE_HIP - lift;
  const shoulder = FIGURE_SHOULDER - lift + slump + hunch * 0.6;
  const head = { x: lean + s * (slump * 0.6 + hunch * 1.2), y: FIGURE_HEAD - lift + slump * 2 + hunch };
  const width = chama ? 14 : old ? 20 : 18;
  g.lineStyle(old ? 7 : chama ? 4.5 : 6, old ? pants : skin);
  g.lineBetween(-5, 0, -3, hip).lineBetween(5, 0, 3, hip);
  if (chama) g.fillStyle(pants).fillPoints([{ x: -6, y: hip - 3 }, { x: 6, y: hip - 3 }, { x: 10, y: hip + 10 }, { x: -10, y: hip + 10 }], true);
  else rect(g, pants, -8, hip - 2, 16, old ? 6 : 10);
  rect(g, cloth, lean / 2 - width / 2, shoulder, width, hip - shoulder + 2);
  if (old) g.fillEllipse(lean / 2 + s * 4, hip - 10, 18, 16);
  g.fillStyle(skin).fillCircle(head.x, head.y, FIGURE_HEAD_R);
  HAIR_PAINTERS[look.hair](g, head.x, head.y, s, dye(look.hairTone), dye, pose.clock);
  if (!ink) drawFace(g, head, s, pose.expression, old);
  const from = { x: lean + s * 5, y: shoulder + 3 };
  const arm = (to) => {
    const bend = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 7 };
    g.lineStyle(chama ? 4 : 5, cloth).lineBetween(from.x, from.y, bend.x, bend.y);
    g.lineStyle(chama ? 4 : 5, skin).lineBetween(bend.x, bend.y, to.x, to.y);
  };
  arm(hand);
  // The cheering arm goes up beside the head, on the kite side, clear of the face.
  if (mood === 'win') arm({ x: head.x + s * 26, y: head.y - 20 + sin(pose.clock * 12) * 4 });
  else if (mood === 'lose') arm({ x: -s * 8, y: hip + 10 });
  else arm({ x: hand.x - s * KID_GRIP, y: hand.y + 9 });
};

/**
 * A kid (or rival) in any pose and size: an ink outline, then the figure with its face.
 * `pose.hand` is in world space, so the string hand can sit exactly on the physics anchor at any scale.
 */
const drawAvatar = (g, look, pose) => {
  const scale = pose.scale * look.scale;
  const hand = { x: (pose.hand.x - pose.x) / scale, y: (pose.hand.y - pose.y) / scale };
  const nudge = PIXEL / scale;
  g.save().translateCanvas(pose.x, pose.y).scaleCanvas(scale, scale);
  OUTLINE.forEach(([dx, dy]) => {
    g.save().translateCanvas(dx * nudge, dy * nudge);
    paintFigure(g, look, pose, hand, true);
    g.restore();
  });
  paintFigure(g, look, pose, hand);
  g.restore();
};

const KITE_POINTS = [[0, -44], [25, -12], [19, 17], [0, 26], [-19, 17], [-25, -12]];
const KITE_HUB = [0, -6];

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
  kite.vx * FLUTTER_LEAN +
  sin(flyer.clock * FLUTTER_RATE + flyer.player * 2) * FLUTTER_SWING +
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
  const wear = clamp01(kite.fray / FRAY_TOUGHNESS);
  if (wear > 0) {
    g.lineStyle(4 + floor(wear * 4) * 2, DANGER, wear * (0.4 + 0.3 * sin(flyer.clock * 14))).strokePoints(curve);
    const blade = rival.tail[TAIL_BLADE_FROM + 2];
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
const drawBow = (g, { x, y }, previous, color) => {
  const [dx, dy] = unit(x - previous.x, y - previous.y);
  [-1, 1].forEach((side) => {
    const ox = -dy * 7 * side;
    const oy = dx * 7 * side;
    g.fillStyle(color).fillTriangle(x, y, x + ox + dx * 3, y + oy + dy * 3, x + ox - dx * 3, y + oy - dy * 3);
  });
};

/** Tail cord with alternating bows, then the steel hojilla with teeth and a glinting tip. */
const drawTail = (g, kite, [a, b], shimmer = 1) => {
  const { tail } = kite;
  g.lineStyle(2, INK).strokePoints(tail.slice(0, TAIL_BLADE_FROM + 1));
  for (let i = 1; i < TAIL_BLADE_FROM; i += 1) drawBow(g, tail[i], tail[i - 1], i % 2 ? a : b);
  const blade = tail.slice(TAIL_BLADE_FROM);
  // VIDRIO: ground glass glued on the blade glows.
  if (kite.vidrio) g.lineStyle(14, GLASS, 0.4 + 0.3 * shimmer).strokePoints(blade);
  g.lineStyle(6, INK).strokePoints(blade);
  g.lineStyle(2, STEEL).strokePoints(blade);
  g.fillStyle(WHITE);
  blade.slice(1).forEach(({ x, y }, i) => {
    const [dx, dy] = unit(x - blade[i].x, y - blade[i].y);
    const side = i % 2 ? 5 : -5;
    g.fillTriangle(x, y, x - dx * 6, y - dy * 6, x - dy * side - dx * 2, y + dx * side - dy * 2);
  });
  const tip = tail[TAIL_SEGMENTS];
  rect(g, WHITE, tip.x - 4, tip.y - 1, 8, 2, shimmer).fillRect(tip.x - 1, tip.y - 4, 2, 8);
};

const BOLT_ICON = [[2, -12], [-6, 2], [0, 2], [-2, 12], [6, -2], [0, -2]];

/** The NYLON shield: a pulsing bubble around the kite. */
const drawShield = (g, kite, clock) => kite.nylon && g.lineStyle(2, GLASS, 0.6 + 0.3 * sin(clock * 8)).strokeCircle(kite.x, kite.y, 42);

/** A floating power box: a wooden crate with its power's icon, bobbing on the wind. */
const drawBox = (g, { x, y, kind }, clock) => {
  const by = y + round(sin(clock * 3 + x) * 3) * PIXEL;
  const half = CRATE_SIZE / 2;
  rect(g, INK, x - half - 2, by - half - 2, CRATE_SIZE + 4, CRATE_SIZE + 4).fillStyle(CRATE_WOOD).fillRect(x - half, by - half, CRATE_SIZE, CRATE_SIZE);
  g.lineStyle(2, CRATE_EDGE).strokeRect(x - half + 3, by - half + 3, CRATE_SIZE - 6, CRATE_SIZE - 6);
  if (kind === 'vidrio') g.fillStyle(GLASS).fillTriangle(x, by - 11, x + 7, by + 3, x - 5, by + 10).fillStyle(WHITE).fillRect(x - 1, by - 5, 3, 3);
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
const SPARK_COLORS = [
  [WHITE, 0xffe08a, 0xff9a40],
  [WHITE, 0xbfe9ff, 0x5ab0ff],
];

/** Pixel spark bursts. */
class Fx {
  constructor(scene) {
    const spark = bake(scene, 'pixel', 1, 1, paintPixel);
    this.emitters = SPARK_COLORS.map((color) => scene.add.particles(0, 0, spark, { ...SPARKS, color }));
  }

  /** Pixel sparks of one kind (0 warm, 1 electric). */
  sparks(count, x, y, kind = 0) {
    this.emitters[kind].explode(count, x, y);
  }

  /** A big burst of sparks: warm for a cut, cold for the cables. */
  burst(kind, x, y) {
    this.sparks(BURST_SPARKS, x, y, kind);
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
// Most voices go through a lowpass filter.
const LOWPASS = 'lowpass';
// Each sound is a list of voices: [wave or 'noise', frequency, filter type, filter sweep from, to, gain, seconds,
// delay, attack]. Every voice fades in over `attack` s, so nothing starts with a crack.
const notes = (midis, gain) => midis.map((midi, i) => ['triangle', midiToHz(midi), LOWPASS, 3500, 900, gain, 0.4, i * 0.08]);
const SOUNDS = {
  // JALAR: wind swelling along the string, a soft band of noise rising in pitch.
  whoosh: [['noise', 0, 'bandpass', 300, 1300, 0.3, 0.45, 0, 0.14]],
  snap: [['noise', 0, 'highpass', 3000, 3000, 0.35, 0.08], ['sine', 90, LOWPASS, 400, 200, 0.4, 0.3]],
  crackle: [['sawtooth', 55, LOWPASS, 2500, 300, 0.25, 0.5, 0, 0.02]],
  thud: [['sine', 70, LOWPASS, 300, 300, 0.5, 0.35]],
  go: [['triangle', 880, LOWPASS, 4000, 4000, 0.2, 0.15]],
  jingle: notes(JINGLE, 0.3),
  power: notes(POWER_UP, 0.25),
};
// Chiptune under the action, in sixteenth steps (16 per bar). The lead's hook is four bars of A minor (Am F C G),
// played twice with a cadence bar closing the second pass; one letter per step is a note ('a' = A4, a semitone
// each) held until the next one, '.' holds. `step` is the sixteenth (s) per mood: the title, the duel, the hot end.
const CHIP_STEP = { calm: 0.1, duel: 0.094, hot: 0.082 };
const LEAD = ['m.hm.pom.k.h.fh.', 'i.di.mki.h.d.fh.', 'h.kp.opr.p.k.hk.', 'o.kf.kor.rpomkhf', 'h.ko.m.km...m...'];
const PHRASE = [0, 1, 2, 3, 0, 1, 2, 4];
const ROOTS = [45, 41, 48, 43, 45];
// Drum voices (the noise channel, plus a low sine kick).
const DRUMS_KICK = ['sine', 55, LOWPASS, 200, 200, 0.8, 0.12];
const DRUMS_SNARE = ['noise', 0, 'bandpass', 1800, 900, 0.45, 0.12];
const DRUMS_HAT = ['noise', 0, 'highpass', 8000, 8000, 0.12, 0.03];

/** Light synthesised SFX and the chiptune; silent without an AudioContext and never needed to play. */
const createSfx = (ctx) => {
  if (!ctx) return { play() {}, music() {} };
  const master = ctx.createGain();
  const band = ctx.createGain();
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  master.gain.value = 0.5;
  band.gain.value = 0;
  master.connect(ctx.destination);
  band.connect(master);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  window.addEventListener('keydown', () => ctx.state === 'suspended' && ctx.resume());

  /** One voice through a sweeping filter and a fading gain, at `start` (s, audio clock) into `out`. */
  const voice = ([wave, frequency, type, from, to, gain, duration, delay = 0, attack = ATTACK], start = ctx.currentTime + delay, out = master) => {
    const source = wave === 'noise' ? assign(ctx.createBufferSource(), { buffer: noise }) : assign(ctx.createOscillator(), { type: wave });
    if (frequency) source.frequency.value = frequency;
    const filter = assign(ctx.createBiquadFilter(), { type });
    const amp = ctx.createGain();
    filter.frequency.setValueAtTime(from, start).exponentialRampToValueAtTime(to, start + duration);
    amp.gain
      .setValueAtTime(0.001, start)
      .exponentialRampToValueAtTime(gain, start + attack)
      .exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(out);
    source.start(start);
    source.stop(start + duration);
  };

  /** One sixteenth: square lead, bouncing triangle bass on the eighths, and the drums (busier when hot). */
  const sixteenth = (count, start, mood, step) => {
    const at = count % 16;
    const bar = PHRASE[floor(count / 16) % PHRASE.length];
    const line = LEAD[bar];
    const hot = mood === 'hot';
    const play = (spec) => voice(spec, start, band);
    if (line[at] !== '.') {
      let hold = 1;
      while (at + hold < 16 && line[at + hold] === '.') hold += 1;
      play(['square', midiToHz(line.charCodeAt(at) - 28 + (hot ? 12 : 0)), LOWPASS, 4000, 1500, hot ? 0.12 : 0.16, hold * step * 0.9]);
    }
    if (at % 2 === 0) play(['triangle', midiToHz(ROOTS[bar] + (at % 4 ? 12 : 0)), LOWPASS, 1200, 600, 0.5, step * 1.8]);
    if (at % (hot ? 4 : 8) === 0) play(DRUMS_KICK);
    if (mood !== 'calm' && (at % 8 === 4 || (hot && bar === 3 && at > 11))) play(DRUMS_SNARE);
    if (hot || at % 2 === 0) play(DRUMS_HAT);
  };

  // A lookahead scheduler on the audio clock: one loop for the whole game, so moods switch without stacking.
  let mood = null;
  let count = 0;
  let next = 0;
  setInterval(() => {
    if (!mood || ctx.state !== 'running') return;
    const step = CHIP_STEP[mood];
    next = max(next, ctx.currentTime + 0.05);
    for (; next < ctx.currentTime + CHIP_AHEAD; next += step) sixteenth(count++, next, mood, step);
  }, CHIP_EVERY);

  return {
    play: (name) => SOUNDS[name].forEach((spec) => voice(spec)),
    /** 'calm', 'duel' or 'hot' plays the chiptune in that mood (from its first bar when it was silent); null fades it out. */
    music(name) {
      if (name === mood) return;
      if (!mood) count = 0;
      mood = name;
      band.gain.setTargetAtTime(name ? CHIP_LEVEL : 0, ctx.currentTime, 0.05);
    },
  };
};

const sfx = createSfx(createAudioContext());

// ---------------------------------------------------------------------------
// 15. Duel view & HUD
// ---------------------------------------------------------------------------

// Wind cues: [text, colour].
const CUES = {
  viene: ['¡SE VIENE LA CALMA!', DIM],
  calma: ['¡CALMA! · JALA PARA SUBIR', CREAM],
  // The match's first calm teaches the hold instead.
  primera: ['MANTÉN B1 PARA JALAR', GOLD],
  rafaga: ['¡RÁFAGA!', GOLD],
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

const createBanner = () => ({ shout: null, left: 0, queue: [] });

/** Puts a shout `{ rank, … }` on screen when it outranks the current one, otherwise in line. */
const announce = (banner, shout) => {
  const [first, ...rest] = [banner.shout, ...banner.queue, shout].filter(Boolean).sort((a, b) => b.rank - a.rank);
  if (first !== banner.shout) banner.left = BANNER_SECONDS;
  assign(banner, { shout: first, queue: rest.slice(0, BANNER_KEEP) });
};

/** Counts the slot down; when a shout ends the next in line takes over. Returns the shout on screen, or null. */
const stepBanner = (banner, dt) => {
  banner.left -= dt;
  if (banner.left <= 0) assign(banner, { shout: banner.queue.shift() || null, left: BANNER_SECONDS });
  return banner.shout;
};
// Without an AudioContext the SFX stay silent: the title's attract demo plays through this one.
const SILENCE = createSfx(null);
const EVENT_SOUNDS = { go: 'go', dash: 'whoosh', power: 'power', shield: 'power' };

/** Tints every letter from cream at the top into `color` at the bottom: chunky arcade banner type. */
const shine = (text, color) => text.setTint(CREAM, CREAM, color, color);

const clockText = (seconds) => `${floor(seconds / 60)}:${String(floor(seconds % 60)).padStart(2, '0')}`;

/** Names, score (TIEMPO) or kites left (VIDAS), AIRE meters, active powers, the clock and the centre banner. */
class Hud {
  constructor(scene, names, kites, rules) {
    assign(this, { kites, rules, slot: createBanner(), refusedAt: [-REFUSE_S, -REFUSE_S], clock: 0 });
    this.g = scene.add.graphics();
    const side = (player, x) => (player ? W - x : x);
    // One text per player, aligned to its own screen edge.
    const edges = (y, texts, size, colors) =>
      texts.map((text, player) => label(scene, side(player, HUD_MARGIN), y, text, size, colors[player]).setOrigin(player, 0.5));
    const tags = edges(HUD_NAME_Y, names, 1, PLAYER_COLORS);
    this.scores = edges(HUD_SCORE_Y, ['', ''], 2, []);
    this.powers = edges(HUD_POWER_Y, ['', ''], 1, [GLASS, GLASS]);
    this.time = centred(scene, HUD_CLOCK_Y, '', 2);
    // Banners sit above the fight (which happens around y 150-350) so they never hide a cut.
    this.banner = centred(scene, 124, '', 3);
    this.detail = centred(scene, 168, '', 1);
    this.left = (player) => side(player, HUD_MARGIN + (player ? HUD_METER_W : 0));
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
    const left = MATCH_TIME - duel.elapsed;
    const sudden = left <= 0;
    this.time.setText(isTimed(duel) ? (sudden ? '¡MUERTE SÚBITA!' : clockText(left + 0.99)) : '');
    this.time.setTint(left < MATCH_DOUBLE ? DANGER : CREAM).setScale(sudden ? 0.5 : 1);
    const shout = stepBanner(this.slot, dt);
    // JALA PARA SUBIR only once the calm has really started, when a JALAR visibly lifts the kite.
    const wind = windCue(duel);
    const coming = wind === 'calma' && weatherAt(duel).wind >= WIND_LULL;
    const kind = coming ? 'viene' : wind;
    const cue = duel.phase === 'fly' && CUES[kind === 'calma' && duel.elapsed < MATCH_HINT ? 'primera' : kind];
    const counting = duel.phase === 'countdown';
    if (counting) {
      const goal = isTimed(duel) ? `MÁS PUNTOS EN ${clockText(MATCH_TIME)}` : `${MATCH_LIVES} PAPAGAYOS CADA UNO`;
      this.show(String(ceil((duel.clock / MATCH_COUNTDOWN) * COUNTDOWN_STEPS)), goal, GOLD);
    } else if (shout) this.show(shout.text, shout.detail, shout.color);
    else if (cue) {
      // A wind cue is smaller and blinks.
      const [text, color] = cue;
      this.show(text, '', null, 2 / 3);
      this.banner.setTint(color).setAlpha(0.55 + 0.45 * abs(sin(this.clock * 5)));
    }
    this.banner.setVisible(counting || Boolean(shout || cue));
    this.detail.setVisible(this.banner.visible);
  }

  drawPlayer(g, duel, kite, player) {
    const left = this.left(player);
    const refused = this.clock - this.refusedAt[player] < REFUSE_S;
    if (isTimed(duel)) this.scores[player].setText(String(duel.score[player]));
    else {
      for (let pip = 0; pip < MATCH_LIVES; pip += 1) {
        drawPapagayo(g, left + 10 + pip * HUD_PIP_GAP, HUD_SCORE_Y, 0, HUD_PIP_SCALE, this.kites[player], pip < duel.lives[player]);
      }
    }
    const ready = canPull(kite);
    rect(g, INK, left - 4, HUD_METER_Y - 4, HUD_METER_W + 8, HUD_METER_H + 8);
    rect(g, refused ? DANGER : ready ? PLAYER_COLORS[player] : DIM, left, HUD_METER_Y, floor((HUD_METER_W * kite.air) / PIXEL) * PIXEL, HUD_METER_H);
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
    const ahead = weatherAt(duel, duel.elapsed + WIND_LEAD);
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
    this.hud?.update(duel, dt);
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
    const shout = (name, tint) => this.hud?.shout(name, tint);
    const reactions = {
      go: () => shout('go'),
      refused: () => this.hud?.refuse(player),
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
    reactions[type]?.();
    if (EVENT_SOUNDS[type]) this.audio.play(EVENT_SOUNDS[type]);
  }

  /** The lost kite tumbles away; a cut flashes warm where the string snapped, the cables spark, and the kids react. */
  point({ cause, loser, winner, value, kite }, duel) {
    this.hud?.shout(cause, winner === null ? CREAM : PLAYER_COLORS[winner], value > 1 ? '¡PUNTO DOBLE!' : '');
    if (winner === null) return;
    const flyer = this.flyers[loser];
    flyer.fall = createFall(kite);
    flyer.cheer('lose');
    this.flyers[winner].cheer('win');
    if (cause === 'cut') {
      const at = nearestOnSegment(duel.kites[winner].tail[TAIL_SEGMENTS], kite.anchor, kite);
      this.fx.burst(0, at.x, at.y);
      this.audio.play('snap');
    } else if (cause === 'line') {
      this.fx.burst(1, kite.x, kite.y);
      this.audio.play('crackle');
    } else this.audio.play('thud');
    if (!this.attract) this.camera.shake(SHOT_SHAKE_MS, SHOT_SHAKE);
    this.audio.play('jingle');
  }
}

// ---------------------------------------------------------------------------
// 16. UI helpers
// ---------------------------------------------------------------------------

/** Tweens `props` on `target` back and forth for ever. */
const pulse = (scene, target, props, duration, ease) => scene.tweens.add({ targets: target, ...props, duration, yoyo: true, repeat: -1, ease });

/** Centred pixel-font text; `size` is how many screen pixels each font pixel takes (the font's size is its cell width). */
const label = (scene, x, y, text, size = 1, color = CREAM) =>
  scene.add.bitmapText(x, y, FONT_KEY, text, FONT_CELL * PIXEL * size).setOrigin(0.5).setTint(color);

/** Pixel-font text centred across the screen. */
const centred = (scene, y, text, size, color) => label(scene, W / 2, y, text, size, color);

/** The big golden heading of a menu screen. */
const heading = (scene, text) => shine(centred(scene, SCREEN_HEADING, text, 3), GOLD);

/** The help line at the bottom of a screen (cream, so it reads over the dark rooftops). */
const footer = (scene, text) => centred(scene, SCREEN_FOOTER, text);

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
    pulse(scene, this.cursor, { scaleX: 0.5 }, 260);
    this.highlight();
  }

  handle(code) {
    if (this.locked) return;
    if (MENU_CODES_UP.includes(code)) this.move(-1);
    else if (MENU_CODES_DOWN.includes(code)) this.move(1);
    else if (isConfirm(code)) this.confirm();
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

/** A scene class registered under `key`. */
const keyed = (key, Base = Phaser.Scene) =>
  class extends Base {
    constructor() {
      super(key);
    }
  };

/** Top-five table in the bottom panel; returns fill(), which repaints it and can highlight one rank. */
const addBoard = (scene, entries = Leaderboard.sanitize(null), highlight = -1) => {
  panel(scene, BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);
  centred(scene, BOARD_Y + 24, 'MEJORES PAPAGAYEROS', 1, GOLD);
  const rows = range(LEADERBOARD_SIZE, (i) => centred(scene, BOARD_Y + BOARD_FIRST_ROW + i * BOARD_ROW, ''));
  const fill = (list) =>
    list.forEach(({ name, score }, i) => {
      rows[i].setText(`${i + 1}. ${name} ${String(score).padStart(BOARD_SCORE_WIDTH)}`).setTint(i === highlight ? PLAYER_COLORS[0] : CREAM);
      if (i === highlight) pulse(scene, rows[i], { alpha: 0.3 }, 260);
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
      if (dash && this.duel.phase === 'fly' && !canPull(this.duel.kites[player])) this.view.react({ type: 'refused', player }, this.duel);
    });
    for (const event of stepDuel(this.duel, inputs, DT)) {
      this.view.react(event, this.duel);
      if (event.cause === 'cut') this.hitstop = SHOT_HITSTOP;
      this.listen(event);
    }
  }
}

// The attract demo: two CPU sparring partners fight behind the menu (bolder than any ladder rival, so a point
// comes every few seconds) and start over after each match. Left idle for `idleMs`, the title plays the opening.
const ATTRACT_LEVELS = [3, 5];
const ATTRACT_RULES = 'vidas';
const ATTRACT_SPAR = { aggression: 1, guard: 0, pace: 1, stroke: 90 };
// [y offset, size] of PAPAGAYO, KOMBAT and the subtitle.
const LOGO_LINES = [[-44, 4], [20, 5], [76, 2]];
const RULE_NAMES = ['TIEMPO', 'VIDAS'];
const attractLooks = () => ATTRACT_LEVELS.map((level) => RIVAL_LOOKS[level]);

const SINE_EASE = 'Sine.easeInOut';

/** The PAPAGAYO KOMBAT logo, 90s fighting-game style: chunky letters with hard drop shadows, KOMBAT burning
 * gold to red, over GUERRA EN EL CIELO DE CARACAS; it sways like a kite. */
const addLogo = (scene) => {
  const parts = ['PAPAGAYO', 'KOMBAT', 'GUERRA EN EL CIELO DE CARACAS'].flatMap((text, i) => {
    const [y, size] = LOGO_LINES[i];
    const offset = i < 2 ? LOGO_SHADOW : PIXEL;
    const shadow = label(scene, offset, y + offset, text, size, INK);
    const face = label(scene, 0, y, text, size);
    if (i === 1) face.setTint(GOLD, GOLD, LOGO_KOMBAT, LOGO_KOMBAT);
    else shine(face, i ? GOLD : 0xff7a2f);
    return [shadow, face];
  });
  const container = scene.add.container(W / 2, LOGO_Y, parts);
  pulse(scene, container, { rotation: { from: -LOGO_SWAY, to: LOGO_SWAY } }, LOGO_SWAY_MS, SINE_EASE);
  return container;
};

/** Every scene starts on a fresh input queue, with its own music (null for silence). */
const enterScene = (mood) => {
  Arcade.drain();
  sfx.music(mood);
};

class TitleScene extends keyed('Title') {
  create() {
    enterScene('calm');
    this.idle = 0;
    this.view = new DuelView(this, null, attractLooks());
    this.startDemo();
    addLogo(this);
    panel(this, TITLE_BACKING_X, TITLE_BACKING_Y, TITLE_BACKING_WIDTH, TITLE_BACKING_HEIGHT);
    // First how many players, then the match rules.
    this.menu = new Menu(this, W / 2, TITLE_MENU_Y, ['1 JUGADOR', '2 JUGADORES'], (players) =>
      this.menu.ask(RULE_NAMES, (rule) => this.scene.start('HowTo', { mode: players ? 'versus' : 'solo', rules: RULES[rule] })),
    );
    const fill = addBoard(this);
    Leaderboard.load().then((entries) => this.sys.isActive() && fill(entries));
    footer(this, 'PLATANUS HACK 26 · CARACAS');
  }

  startDemo() {
    this.view.flyers.forEach((flyer) => flyer.cheer(null, 0));
    const pilots = ATTRACT_LEVELS.map((level, player) => new CpuPilot(level, player, ATTRACT_SPAR));
    this.demo = new DuelLoop(createDuel(makeRng(Date.now()), ATTRACT_RULES), pilots, this.view, ({ type }) => {
      if (type === 'over') this.time.delayedCall(ATTRACT_RESTART_MS, () => this.startDemo());
    });
  }

  update(time, delta) {
    this.demo.update(delta / 1000);
    const presses = Arcade.drain();
    presses.forEach((code) => this.menu.handle(code));
    this.idle = presses.length ? 0 : this.idle + delta;
    if (this.idle > ATTRACT_IDLE_MS) this.scene.start('Opening');
  }
}

// When the wind whooshes (s): both launches and the middle of the first three saw strokes.
const OPENING_WHOOSHES = [OPENING_LAUNCH, OPENING_RIVAL, ...range(3, (i) => OPENING_SAW + ((i + 0.5) * PI) / OPENING_STROKE_RATE)];
// Kite paths as [second, x, y] keys: the kid's kite climbs and swoops onto the rival string; the rival's climbs and holds.
const OPENING_PATHS = [
  [[OPENING_LAUNCH, 170, 500], [OPENING_LAUNCH + OPENING_CLIMB, 280, 230], [OPENING_SAW, 523, 217], [OPENING_SLAM, 470, 260]],
  [[OPENING_RIVAL, 630, 500], [OPENING_RIVAL + OPENING_CLIMB, 380, 170]],
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
class OpeningScene extends keyed('Opening') {
  create() {
    enterScene('duel');
    assign(this, { clock: 0, whooshes: [...OPENING_WHOOSHES], severed: false, logo: null });
    this.view = new DuelView(this, null, attractLooks());
    this.duel = createDuel(makeRng(OPENING_SEED));
    this.duel.kites.forEach((kite, player) => {
      assign(kite, track(OPENING_PATHS[player], 0));
      hangTail(kite);
    });
    // Starts close on the sun (a little toward the city), then pulls back to the pixel view.
    const pull = OPENING_PULL * 1000;
    this.cameras.main
      .setZoom(1)
      .centerOn(SUN_X + 80, SUN_Y)
      .fadeIn(OPENING_FADE_MS)
      .pan(W / 2, H / 2, pull, SINE_EASE)
      .zoomTo(1 / PIXEL, pull, SINE_EASE);
  }

  update(time, delta) {
    const dt = delta / 1000;
    const clock = (this.clock += dt);
    const { duel } = this;
    duel.elapsed += dt;
    const weather = weatherAt(duel);
    const [mine, rival] = duel.kites;
    const sawing = clock > OPENING_SAW && clock < OPENING_CUT;
    this.fly(mine, OPENING_PATHS[0], sawing ? sin((clock - OPENING_SAW) * OPENING_STROKE_RATE) * OPENING_STROKE : 0, weather, dt);
    if (this.severed) stepKite(rival, IDLE_INPUT, weather, dt);
    else {
      this.fly(rival, OPENING_PATHS[1], 0, weather, dt);
      rival.fray = FRAY_TOUGHNESS * OPENING_FRAY * clamp01((clock - OPENING_SAW) / (OPENING_CUT - OPENING_SAW));
    }
    if (clock >= OPENING_CUT && !this.severed) this.cut();
    if (clock >= OPENING_SLAM && !this.logo) this.slam();
    // The attract view stays silent, so the opening plays its own sounds on the beats.
    if (this.whooshes[0] <= clock) {
      this.whooshes.shift();
      sfx.play('whoosh');
    }
    this.view.update(duel, dt);
    if (Arcade.drain().length || clock >= OPENING_END) this.scene.start('Title');
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
    this.cameras.main.shake(SHOT_SHAKE_MS, SHOT_SHAKE);
    sfx.play('snap');
  }

  /** The logo drops in from huge and lands with a shake and a shower of sparks. */
  slam() {
    this.logo = addLogo(this).setScale(OPENING_SLAM_SCALE).setAlpha(0);
    this.tweens.add({
      targets: this.logo,
      scale: 1,
      alpha: 1,
      duration: OPENING_SLAM_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.cameras.main.shake(SHOT_SHAKE_MS, SHOT_SHAKE * 2);
        this.view.fx.sparks(OPENING_SLAM_SPARKS, W / 2, LOGO_Y);
        sfx.play('thud');
        sfx.play('jingle');
      },
    });
  }
}

/** Menu scenes over the living backdrop (no music): input is drained on entry and idle time builds up while
 * nobody presses. */
class BackdropScene extends Phaser.Scene {
  stage(looks, moods) {
    enterScene(null);
    this.idle = 0;
    this.scenery = new Scenery(this, looks, moods);
  }

  update(time, delta) {
    this.scenery.update(delta / 1000);
    const presses = Arcade.drain();
    this.idle = presses.length ? 0 : this.idle + delta;
    this.step(presses, delta);
  }

  /** For screens that move on by themselves: true once, when B1/START is pressed or `elapsed` reaches `ms`. */
  ends(presses, ms) {
    if (this.leaving || (!presses.some(isConfirm) && this.elapsed < ms)) return false;
    return (this.leaving = true);
  }
}

const HOWTO_COLUMNS = [210, 590];
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
  const sx = x + JOYSTICK_X;
  const [base, ball] = [y + JOYSTICK_BASE, y + JOYSTICK_BALL];
  rect(g, PANEL_PLATE, x - PANEL_WIDTH / 2, y + PANEL_TOP, PANEL_WIDTH, PANEL_HEIGHT);
  g.fillStyle(INK).fillCircle(sx, base, JOYSTICK_BASE_R).fillStyle(PANEL_PLATE).fillCircle(sx, base, JOYSTICK_BASE_R - 6);
  rect(g, INK, sx - JOYSTICK_SHAFT, ball, JOYSTICK_SHAFT * 2, base - ball);
  g.fillStyle(INK).fillCircle(sx, ball, JOYSTICK_BALL_R + 2).fillStyle(PANEL_CAP).fillCircle(sx, ball, JOYSTICK_BALL_R - 2);
  label(scene, sx, y + PANEL_HINT, stickKeys, 1, color);
  for (let i = 0; i < 6; i += 1) {
    const bx = x + BUTTONS_X + (i % 3) * BUTTONS_GAP;
    const by = y + floor(i / 3) * BUTTONS_ROW;
    const alpha = i < 3 ? 1 : BUTTONS_UNUSED_ALPHA;
    if (i < BUTTONS_USED) {
      g.lineStyle(4, color).strokeCircle(bx, by, BUTTONS_RADIUS + BUTTONS_RING);
      label(scene, bx, by + PANEL_HINT, buttonKeys[i], 1, color);
    }
    g.fillStyle(INK, alpha).fillCircle(bx, by, BUTTONS_RADIUS + 2).fillStyle(PANEL_CAP, alpha).fillCircle(bx, by, BUTTONS_RADIUS);
    label(scene, bx, by, String(i + 1), 1, INK).setAlpha(alpha);
  }
};

class HowToScene extends keyed('HowTo', BackdropScene) {
  init(setup) {
    assign(this, { setup, elapsed: 0, leaving: false });
  }

  create() {
    const { mode } = this.setup;
    const players = playersOf(mode);
    this.stage(looksOf(lineup(mode, 0, DEFAULT_CHOICES)));
    panel(this, HOWTO_MARGIN, HOWTO_TOP, W - 2 * HOWTO_MARGIN, HOWTO_HEIGHT);
    heading(this, 'CÓMO JUGAR');
    const g = this.add.graphics();
    players.forEach((player) => {
      const x = players.length > 1 ? HOWTO_COLUMNS[player] : W / 2;
      label(this, x, HOWTO_CABINET_Y - 80, `JUGADOR ${player + 1}`, 1, PLAYER_COLORS[player]);
      drawControls(this, g, x, HOWTO_CABINET_Y, player);
    });
    CONTROLS.forEach((text, i) => centred(this, HOWTO_LEGEND_Y + i * HOWTO_LINE_GAP, text, 2));
    centred(this, HOWTO_GOAL_Y, 'SERRUCHA EL HILO RIVAL CON TU COLA', 1, GOLD);
    POWERS.forEach((kind, i) => {
      const x = W / 2 + (i - 1.5) * HOWTO_POWER_GAP;
      drawBox(g, { x, y: HOWTO_POWERS_Y, kind }, 0);
      label(this, x, HOWTO_POWERS_Y + 36, kind.toUpperCase(), 1, GLASS);
      label(this, x, HOWTO_POWERS_Y + 56, POWER_WORDS[i]);
    });
    footer(this, 'B1 / START: ¡VAMOS!');
  }

  step(presses, delta) {
    this.elapsed += delta;
    if (this.ends(presses, HOWTO_MS)) this.scene.start('Build', this.setup);
  }
}

const BUILD_COLUMNS = [200, 600];
const ROW_TITLES = ['CHAMO / CHAMA', 'PEINADO', 'PIEL', 'FRANELA', 'PAPAGAYO'];

/** Text for a row's value: names for body and hair, a counter for colours and kites (the preview shows them). */
const rowValue = (choice, row) => {
  if (row === 'body') return BODY_NAMES[choice.body];
  if (row === 'hair') return HAIR_NAMES[choice.hair];
  return `${choice[row] + 1} / ${ROW_SIZES[row]}`;
};

/** Hanging tail points under a kite drawn outside the duel (menus and cards). */
const restingTail = (x, y, clock) =>
  range(TAIL_SEGMENTS + 1, (i) => ({ x: x + sin(clock * 2 + i * 0.6) * i * 0.7, y: y + KITE_RADIUS + i * TAIL_SEGMENT * 0.8 }));

/** A large, standing avatar holding its kite string toward (kite.x, kite.y). */
const drawPortrait = (g, look, pose, kite) => {
  const { x, y, scale, side, mood, clock } = pose;
  const reach = scale * look.scale;
  const hand = { x: x + side * 14 * reach, y: y - 50 * reach };
  g.lineStyle(2, CREAM).lineBetween(hand.x, hand.y, kite.x, kite.y + 20);
  drawTail(g, { tail: restingTail(kite.x, kite.y, clock) }, look.kite.colors);
  drawPapagayo(g, kite.x, kite.y, sin(clock * 1.5) * 0.1, 0.8, look.kite);
  drawAvatar(g, look, { ...pose, expression: mood || 'focus', lift: 0, yank: 0, hand });
};

class BuildScene extends keyed('Build', BackdropScene) {
  init(setup) {
    assign(this, setup, { clock: 0, touched: false, leaving: false });
  }

  create() {
    this.choices = sanitizeChoices(null);
    this.players = playersOf(this.mode);
    this.stage(looksOf(lineup(this.mode, 0, this.choices)));
    heading(this, 'ARMA TU PAPAGAYERO');
    this.columns = this.players.map((player) => this.addColumn(player, this.players.length === 1 ? W / 2 : BUILD_COLUMNS[player]));
    this.g = this.add.graphics();
    footer(this, 'JOYSTICK: ELEGIR · B1: ¡LISTO!');
    AvatarStore.load().then((stored) => {
      if (!this.sys.isActive() || this.touched) return;
      this.choices = stored;
      this.players.forEach((player) => this.refresh(player));
    });
    this.players.forEach((player) => this.refresh(player));
  }

  addColumn(player, x) {
    const half = BUILD_WIDTH / 2;
    panel(this, x - half, BUILD_TOP, BUILD_WIDTH, BUILD_HEIGHT);
    label(this, x, BUILD_TOP + 26, `JUGADOR ${player + 1}`, 1, PLAYER_COLORS[player]);
    const rowX = x + 86;
    const values = LOOK_ROWS.map((row, i) => {
      const y = BUILD_ROWS_Y + i * BUILD_ROW_GAP;
      label(this, rowX, y, ROW_TITLES[i], 1, DIM);
      return label(this, rowX, y + 22, '');
    });
    const status = label(this, x, BUILD_TOP + BUILD_HEIGHT - 28, '', 2);
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
    column.status.setText(column.ready ? '¡LISTO!' : 'B1: ¡LISTO!').setTint(column.ready ? BUILD_READY : DIM);
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
    this.time.delayedCall(BUILD_LEAVE_MS, () =>
      this.scene.start(isSolo(mode) ? 'Intro' : 'Duel', { mode, rules, level: 0, total: 0, choices }),
    );
  }

  step(presses, delta) {
    this.clock += delta / 1000;
    if (this.leaving) return;
    presses.forEach((code) => this.players.forEach((player) => this.handle(player, code)));
    if (this.idle > BUILD_IDLE_MS) this.players.forEach((player) => this.handle(player, PLAYER_CODES[player].start));
    this.draw();
    if (this.columns.every((column) => column.ready)) this.finish();
  }

  draw() {
    const g = this.g.clear();
    this.columns.forEach((column, player) => {
      const look = resolveLook(this.choices[player], player);
      const side = player ? -1 : 1;
      const x = column.x - 96;
      const mood = column.ready ? 'win' : null;
      const pose = { x, y: BUILD_TOP + BUILD_HEIGHT - 46, scale: BUILD_PREVIEW, side, mood, clock: this.clock };
      drawPortrait(g, look, pose, { x: x + side * 40, y: BUILD_TOP + 78 });
    });
  }
}

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
    else if (feature === 'andes') {
      g.fillStyle(0x6a5a8a).fillTriangle(x - 20, y, x + 10, y - 60, x + 40, y);
      g.fillStyle(CREAM).fillTriangle(x + 2, y - 48, x + 10, y - 60, x + 18, y - 48);
    }
    else if (feature === 'cardones') rect(g, 0x3f7a3a, x, y - 40, 8, 40).fillRect(x - 10, y - 26, 10, 6).fillRect(x - 10, y - 34, 4, 10);
    else if (feature === 'mar') rect(g, CREAM, x, y + 8, 12, 2);
    else rect(g, 0xd8d0c0, x, y - 30, 4, 30).fillRect(x - 30, y - 12, 60, 4);
  }
};

/** Ladder card before each solo duel: who the next rival is (look, kite, home, catchphrase) and the points so far. */
class IntroScene extends keyed('Intro', BackdropScene) {
  init(setup) {
    assign(this, { choices: DEFAULT_CHOICES }, setup, { elapsed: 0, leaving: false });
  }

  create() {
    this.cast = lineup('solo', this.level, this.choices);
    this.stage(looksOf(this.cast));
    const { name, home, motto } = RIVALS[this.level];
    const text = (dy, value, size, color) => label(this, CARD_TEXT_X, CARD_TOP + dy, value, size, color);
    panel(this, CARD_LEFT, CARD_TOP, CARD_WIDTH, CARD_HEIGHT);
    this.portrait = this.add.graphics();
    text(38, `RIVAL ${this.level + 1} DE ${RIVALS.length}`, 2, GOLD);
    text(96, name, name.length > CARD_LONG_NAME ? 2 : 3, PLAYER_COLORS[1]);
    text(146, `DE ${home}`, 1);
    text(184, motto, 1, GOLD);
    text(240, `PUNTOS ${this.total}`);
  }

  step(presses, delta) {
    this.elapsed += delta;
    const clock = this.elapsed / 1000;
    const g = this.portrait.clear();
    drawHome(g, this.level, CARD_LEFT + 8, CARD_BOTTOM - 8, CARD_LAND);
    // The rival looks up at its kite in the card's corner, away from the text.
    const pose = { x: CARD_LEFT + 140, y: CARD_BOTTOM - 16, scale: 1.9, side: -1, mood: null, clock };
    drawPortrait(g, this.cast[1].look, pose, { x: CARD_LEFT + 48, y: CARD_TOP + 56 });
    if (!this.ends(presses, INTRO_MS)) return;
    const { level, total, rules, choices } = this;
    this.scene.start('Duel', { mode: 'solo', level, total, rules, choices });
  }
}

class DuelScene extends keyed('Duel') {
  init(setup) {
    assign(this, { level: 0, total: 0, choices: DEFAULT_CHOICES }, setup, { earned: 0, stats: createStats() });
  }

  create() {
    enterScene('duel');
    const solo = isSolo(this.mode);
    const cast = lineup(this.mode, this.level, this.choices);
    this.names = namesOf(cast);
    const pilots = [new HumanPilot(0), solo ? new CpuPilot(this.level, 1) : new HumanPilot(1)];
    const view = new DuelView(this, this.names, looksOf(cast), this.rules);
    const lull = solo ? ladderLull(this.level) : LULLS_VERSUS;
    this.loop = new DuelLoop(createDuel(makeRng(Date.now()), this.rules, lull), pilots, view, (event) => this.record(event));
  }

  record(event) {
    tally(this.stats, event);
    if (event.type === 'point' && isSolo(this.mode)) this.earned += pointScore(event);
    // The band speeds up for the last seconds and the sudden death.
    if (event.type === 'double' || event.type === 'sudden') sfx.music('hot');
    if (event.type === 'over') this.time.delayedCall(RESULT_DELAY_MS, () => this.finish());
  }

  update(time, delta) {
    this.loop.press(Arcade.drain());
    this.loop.update(delta / 1000);
  }

  finish() {
    const { mode, rules, level, names, stats, total, choices } = this;
    const { winner, score } = this.loop.duel;
    const earned = this.earned + (isSolo(mode) ? matchBonus(winner, score, level) : 0);
    this.scene.start('Result', { mode, rules, level, names, stats, winner, score: [...score], earned, total: total + earned, choices });
  }
}

const OUTCOME_TITLES = { next: '¡GANASTE!', champion: '¡REY DEL CIELO!', defeat: '¡TE GANARON!' };
const STAT_ROWS = [
  ['CORTES', 'cuts'],
  ['CHOQUES', 'crashes'],
  ['JALONES', 'dashes'],
];
const STAT_COLUMNS = [300, 500];

/**
 * The end of a match: who won and the stats; then REVANCHA (versus), the next rival (solo win), or the
 * leaderboard, with initials written right here when the total makes it.
 */
class ResultScene extends keyed('Result', BackdropScene) {
  init(summary) {
    assign(this, { summary, state: 'wait', letters: Array(INITIALS_LENGTH).fill('A'), cursor: 0 });
  }

  create() {
    const { mode, level, winner, total, earned, choices = DEFAULT_CHOICES } = this.summary;
    this.outcome = isSolo(mode) ? ladderOutcome(winner, level) : 'versus';
    this.stage(looksOf(lineup(mode, level, choices)), [0, 1].map((player) => (player === winner ? 'win' : 'lose')));
    shine(centred(this, RESULT_TITLE, this.title(), 3), PLAYER_COLORS[winner]);
    centred(this, RESULT_SUBTITLE, this.subtitle(), 1, GOLD);
    this.addStats();
    if (mode === 'versus') {
      this.state = 'menu';
      this.menu = new Menu(this, W / 2, RESULT_MENU, ['REVANCHA', 'MENÚ PRINCIPAL'], (index) =>
        index === 0 ? this.leave('Duel', this.summary) : this.leave('Title'),
      );
      return;
    }
    centred(this, RESULT_TOTAL, `TOTAL ${total}  (+${earned})`, 2);
    if (this.outcome === 'next') this.prompt('PULSA START PARA SEGUIR', 'next');
    else Leaderboard.load().then((entries) => (Leaderboard.qualifies(entries, total) ? this.askInitials() : this.showBoard(entries)));
  }

  title() {
    const { winner, names } = this.summary;
    return this.outcome === 'versus' ? `¡GANÓ ${names[winner]}!` : OUTCOME_TITLES[this.outcome];
  }

  subtitle() {
    const { level, names, score } = this.summary;
    const next = RIVALS[level + 1];
    if (this.outcome === 'next') return `PRÓXIMO: ${next.name} · DE ${next.home}`;
    if (this.outcome === 'champion') return `VENCISTE A LOS ${RIVALS.length} PAPAGAYEROS DE VENEZUELA`;
    if (this.outcome === 'defeat') return `${names[1]} SE QUEDA CON EL CIELO`;
    return `${score[0]} - ${score[1]}`;
  }

  /** CORTES / CHOQUES / JALONES / PUNTOS for both players. */
  addStats() {
    const { names, stats, score } = this.summary;
    const rows = [...STAT_ROWS.map(([title, key]) => [title, stats.map((player) => player[key])]), ['PUNTOS', score]];
    panel(this, (W - RESULT_STATS_WIDTH) / 2, RESULT_STATS - 12, RESULT_STATS_WIDTH, 140);
    STAT_COLUMNS.forEach((x, player) => label(this, x, RESULT_STATS + 8, names[player], 1, PLAYER_COLORS[player]));
    rows.forEach(([title, values], i) => {
      const y = RESULT_STATS + 36 + i * RESULT_STAT_ROW;
      centred(this, y, title, 1, DIM);
      STAT_COLUMNS.forEach((x, player) => label(this, x, y, String(values[player])));
    });
  }

  prompt(text, state) {
    this.state = state;
    const prompt = centred(this, RESULT_PROMPT, text);
    pulse(this, prompt, { alpha: 0.3 }, 500);
  }

  /** A qualifying total: three letters to write right below the stats. */
  askInitials() {
    if (!this.sys.isActive()) return;
    this.state = 'initials';
    this.idle = 0;
    this.slots = this.letters.map((letter, i) => label(this, W / 2 + (i - 1) * INITIALS_GAP, INITIALS_Y, letter, 4));
    this.caret = this.add.rectangle(0, INITIALS_Y + 40, 44, 8, GOLD);
    this.help = [
      centred(this, RESULT_RECORD, '¡NUEVO RÉCORD! ESCRIBE TUS INICIALES', 1, PLAYER_COLORS[0]),
      centred(this, RESULT_HELP, 'JOYSTICK: LETRA · B1: SIGUIENTE'),
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
    else if ((state === 'next' || state === 'board') && presses.some(isConfirm)) this.proceed();
    // Walking away abandons the ladder or the rematch.
    if (this.state !== 'gone' && this.idle > RESULT_IDLE_MS) this.leave('Title');
  }

  write(code) {
    if (this.state !== 'initials') return;
    const step = (codes) => (codes.includes(code) ? 1 : 0);
    const turn = step(MENU_CODES_UP) - step(MENU_CODES_DOWN);
    if (turn) this.letters[this.cursor] = shiftLetter(this.letters[this.cursor], turn);
    this.cursor = min(INITIALS_LENGTH - 1, max(0, this.cursor + step(MENU_CODES_RIGHT) - step(MENU_CODES_LEFT)));
    if (isConfirm(code)) {
      if (this.cursor < INITIALS_LENGTH - 1) this.cursor += 1;
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
