// ─────────────────────────────────────────────────────────────────────────────
// NEON SERPENT — deterministic simulation core
//
//   step(state, inputs) → state
//
// Rules: integers only, seeded PRNG only, no Math.random / Date / DOM.
// State is plain JSON-cloneable data. Same seed + same input log ⇒ same game,
// bit-for-bit, in any browser or in Node. Everything else (replays, ghosts,
// rewind, daily verification, AI ghosts) is built on that guarantee.
// ─────────────────────────────────────────────────────────────────────────────

export const W = 22, H = 22, N = W * H;
export const TPS = 30;                       // simulation ticks per second
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];   // up right down left
export const K = { BERRY: 0, GOLD: 1, REWIND: 2, PHASE: 3, MAGNET: 4, DOUBLE: 5 };
export const MODES = ['classic', 'portal', 'maze', 'daily', 'vsai', 'watch'];

// input codes
export const IN = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, PERK0: 10, PERK1: 11, PERK2: 12, REWIND: 20 };

const BASE = [10, 50, 5, 5, 5, 5];
const TTL = [0, 150, 240, 240, 240, 240];

export const PERKS = [
  { id: 'linger',    name: 'LINGER',      desc: 'Combo window +50%' },
  { id: 'ghosttail', name: 'GHOST TAIL',  desc: 'Pass through your last 4 segments' },
  { id: 'demo',      name: 'DEMOLITION',  desc: 'Golden berries blast walls in radius 3' },
  { id: 'greed',     name: 'GREED',       desc: 'Gold & power-ups spawn 2× as often' },
  { id: 'lean',      name: 'LEAN',        desc: 'Grow only every other berry' },
  { id: 'wind',      name: 'SECOND WIND', desc: 'Survive one fatal hit' },
  { id: 'velvet',    name: 'VELVET',      desc: 'Speed ramps half as fast' },
  { id: 'hoard',     name: 'HOARDER',     desc: '+1 rewind charge, max +1' },
];

// ── PRNG: mulberry32, state lives inside the game state ─────────────────────
export function rnd(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
const randInt = (s, n) => rnd(s) % n;

export const cx = c => c % W, cy = c => (c / W) | 0;

export function create(seed, mode = 'classic') {
  const mid = (H / 2) | 0, row = mid * W;
  const s = {
    v: 1, seed: seed >>> 0, mode, rng: seed >>> 0, tick: 0,
    snake: [row + 10, row + 9, row + 8], prevSnake: null, dir: 1, queue: [],
    grow: 0, moveAcc: 0, moves: 0,
    foods: [], walls: new Array(N).fill(0),
    score: 0, level: 1, eaten: 0, combo: 1, maxCombo: 1, comboT: 0,
    phase: 0, magnet: 0, double: 0, charges: 0,
    perks: {}, draft: null, dead: false, ev: [],
  };
  s.prevSnake = s.snake;
  if (mode === 'maze') addWalls(s, 4);
  spawn(s, K.BERRY);
  return s;
}

export function clone(s) {
  return { ...s, snake: s.snake.slice(), queue: s.queue.slice(),
    foods: s.foods.map(f => ({ ...f })), walls: s.walls.slice(),
    perks: { ...s.perks }, draft: s.draft && s.draft.slice(), ev: [] };
}

export const speed = s => Math.min(620, 240 + (s.level - 1) * (s.perks.velvet ? 11 : 22)); // per mille per tick
const comboWindow = s => (Math.max(48, 90 - s.level * 3) * (s.perks.linger ? 3 : 2)) >> 1;
export { comboWindow };
export const wraps = s => s.mode === 'portal' || s.phase > 0;

// ── the one function that matters ───────────────────────────────────────────
export function step(prev, inputs) {
  const s = clone(prev);
  if (s.dead) return s;

  if (inputs) for (const code of inputs) {
    if (code < 4) pushDir(s, code);
    else if (code >= 10 && code < 13 && s.draft) { applyPerk(s, s.draft[code - 10]); s.draft = null; }
    else if (code === IN.REWIND && s.charges > 0) { s.charges--; s.ev.push({ t: 'rewind' }); }
  }
  if (s.draft) return s;                      // frozen until a perk is chosen

  s.tick++;
  if (s.comboT > 0 && --s.comboT === 0) s.combo = 1;
  if (s.phase > 0) s.phase--;
  if (s.magnet > 0) s.magnet--;
  if (s.double > 0) s.double--;
  if (s.foods.some(f => f.ttl && s.tick - f.born >= f.ttl))
    s.foods = s.foods.filter(f => !f.ttl || s.tick - f.born < f.ttl);

  s.moveAcc += speed(s);
  while (s.moveAcc >= 1000 && !s.dead && !s.draft) { s.moveAcc -= 1000; move(s); }
  return s;
}

function pushDir(s, d) {
  const ref = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (d === ref || d === ((ref + 2) & 3) || s.queue.length >= 3) return;
  s.queue.push(d);
}

function collide(s) {
  if (s.perks.wind > 0) { s.perks.wind--; s.phase = 45; s.ev.push({ t: 'wind' }); return; }
  s.dead = true; s.ev.push({ t: 'die' });
}

function move(s) {
  if (s.queue.length) s.dir = s.queue.shift();
  const h = s.snake[0];
  let x = cx(h) + DX[s.dir], y = cy(h) + DY[s.dir];
  if (x < 0 || y < 0 || x >= W || y >= H) {
    if (!wraps(s)) return collide(s);
    x = (x + W) % W; y = (y + H) % H;
  }
  const c = y * W + x;
  if (s.phase === 0) {
    if (s.walls[c]) return collide(s);
    const len = s.snake.length - (s.grow > 0 ? 0 : 1);
    const lim = len - (s.perks.ghosttail ? 4 : 0);
    for (let i = 1; i < lim; i++) if (s.snake[i] === c) return collide(s);
  }
  s.prevSnake = s.snake.slice();
  s.snake.unshift(c);
  if (s.grow > 0) s.grow--; else s.snake.pop();
  s.moves++;

  if (s.magnet > 0) for (const f of s.foods) {
    const dx = x - cx(f.c), dy = y - cy(f.c);
    if ((dx === 0 && dy === 0) || Math.abs(dx) + Math.abs(dy) > 7) continue;
    const hz = Math.abs(dx) >= Math.abs(dy);
    const t = (cy(f.c) + (hz ? 0 : Math.sign(dy))) * W + cx(f.c) + (hz ? Math.sign(dx) : 0);
    if (!s.walls[t] && !s.foods.some(o => o.c === t) && (t === c || !s.snake.includes(t))) f.c = t;
  }
  const i = s.foods.findIndex(f => f.c === c);
  if (i >= 0) eat(s, s.foods.splice(i, 1)[0]);
}

function eat(s, f) {
  s.combo = s.comboT > 0 ? Math.min(8, s.combo + 1) : 1;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  s.comboT = comboWindow(s);
  const mult = s.combo * (s.double > 0 ? 2 : 1), pts = BASE[f.k] * mult;
  s.score += pts;
  s.ev.push({ t: 'eat', k: f.k, c: f.c, pts, mult, combo: s.combo });

  switch (f.k) {
    case K.BERRY: {
      s.eaten++;
      if (!s.perks.lean || s.eaten % 2 === 0) s.grow++;
      spawn(s, K.BERRY);
      const r = randInt(s, 100), g = s.perks.greed ? 2 : 1;
      if (!s.foods.some(o => o.k !== K.BERRY)) {
        if (r < 14 * g) spawn(s, K.GOLD);
        else if (r < 30 * g) spawn(s, 2 + randInt(s, 4));
      }
      if (s.eaten % 5 === 0) levelUp(s);
      break;
    }
    case K.GOLD:
      s.grow += 2;
      if (s.perks.demo) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = cx(f.c) + dx, y = cy(f.c) + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && s.walls[y * W + x]) { s.walls[y * W + x] = 0; s.ev.push({ t: 'blast', c: y * W + x }); }
      }
      break;
    case K.REWIND: s.charges = Math.min(3 + (s.perks.hoard ? 1 : 0), s.charges + 1); break;
    case K.PHASE: s.phase = 150; break;
    case K.MAGNET: s.magnet = 210; break;
    case K.DOUBLE: {
      s.double = 240;
      const cut = Math.max(0, Math.min((s.snake.length / 3) | 0, s.snake.length - 3));
      for (let j = 0; j < cut; j++) s.ev.push({ t: 'cut', c: s.snake.pop() });
      break;
    }
  }
}

function levelUp(s) {
  s.level++;
  s.ev.push({ t: 'level', level: s.level });
  if (s.mode === 'maze') addWalls(s, 2);
  const pool = PERKS.map((_, i) => i);
  s.draft = [];
  for (let j = 0; j < 3; j++) s.draft.push(pool.splice(randInt(s, pool.length), 1)[0]);
}

function applyPerk(s, idx) {
  const id = PERKS[idx].id;
  s.perks[id] = (s.perks[id] || 0) + 1;
  if (id === 'hoard') s.charges++;
  s.ev.push({ t: 'perk', id });
}

// pick the k-th free cell — bounded, deterministic, no rejection loops
function freeCell(s, minHead) {
  const occ = new Uint8Array(N), h = s.snake[0];
  for (const c of s.snake) occ[c] = 1;
  for (const f of s.foods) occ[f.c] = 1;
  const free = [];
  for (let c = 0; c < N; c++)
    if (!occ[c] && !s.walls[c] && Math.abs(cx(c) - cx(h)) + Math.abs(cy(c) - cy(h)) >= minHead) free.push(c);
  return free.length ? free[randInt(s, free.length)] : -1;
}

function spawn(s, k) {
  const c = freeCell(s, 2);
  if (c >= 0) s.foods.push({ c, k, born: s.tick, ttl: TTL[k] });
}

function addWalls(s, n) {
  const h = s.snake[0];
  for (let j = 0; j < n; j++) {
    const len = 2 + randInt(s, 4), hz = randInt(s, 2), st = freeCell(s, 6);
    if (st < 0) return;
    for (let i = 0; i < len; i++) {
      const x = cx(st) + (hz ? i : 0), y = cy(st) + (hz ? 0 : i), c = y * W + x;
      if (x >= W || y >= H || s.snake.includes(c) || s.foods.some(f => f.c === c)) break;
      if (Math.abs(x - cx(h)) + Math.abs(y - cy(h)) < 5) break;
      s.walls[c] = 1;
    }
  }
}

// FNV-1a over everything that matters — used by tests and the debug HUD
export function hash(s) {
  let h = 0x811c9dc5;
  const mix = v => { h ^= v & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 16) & 0xffff; h = Math.imul(h, 16777619); };
  [s.tick, s.rng, s.score, s.dir, s.grow, s.moveAcc, s.level, s.combo, s.comboT, s.charges, s.phase, s.magnet, s.double].forEach(mix);
  s.snake.forEach(mix); s.foods.forEach(f => { mix(f.c); mix(f.k); mix(f.born); });
  for (let c = 0; c < N; c++) if (s.walls[c]) mix(c);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function dailySeed(date) {
  let h = 2166136261;
  for (const ch of 'neon-serpent:' + date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
