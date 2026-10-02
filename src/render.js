// Low-res pixel renderer: 192×256 "monitor", 8px tiles, hand-made sprites.
// Reads game state, never writes it. Interpolates between 30 Hz ticks.
import { W, H, N, K, cx, cy, speed, wraps, PERKS } from './engine.js';
import { text } from './font.js';

export const SW = 192, SH = 256, T = 8, BX = 8, BY = 24;

export const PALETTES = {
  normal: { bg: '#000', wall: '#2b2bff', wallFill: '#0a0a3a', snake: ['#9cff57', '#3cdc3c', '#1f9e2a'], head: '#d8ff9c', red: '#ff2a2a', yellow: '#ffe14d', cyan: '#2ee8ff', pink: '#ffa0e8', orange: '#ffa040', white: '#ffffff', grey: '#8a8aa8', dim: '#1c1c3a' },
  alt:    { bg: '#000', wall: '#9a9aff', wallFill: '#141430', snake: ['#ffffff', '#2ee8ff', '#1478a0'], head: '#ffffff', red: '#ff9f1c', yellow: '#ffe14d', cyan: '#2ee8ff', pink: '#ffd6f2', orange: '#ff9f1c', white: '#ffffff', grey: '#8a8aa8', dim: '#1c1c3a' },
};

const SPR = {
  berry:  ['...gg...', '....g...', '.rr.rrr.', 'rrrrrrwr', 'rrrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rr.rr.'],
  gold:   ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yyyyyy.', '.yy..yy.', 'yy....yy'],
  rewind: ['..cccc..', '.c....c.', 'c..w...c', 'c..w...c', 'c..www.c', 'c......c', '.c....c.', '..cccc..'],
  phase:  ['...pp...', '..pppp..', '.pp..pp.', 'pp....pp', 'pp....pp', '.pp..pp.', '..pppp..', '...pp...'],
  magnet: ['.ww..ww.', '.rr..rr.', '.rr..rr.', '.rr..rr.', '.rr..rr.', '.rrrrrr.', '..rrrr..', '........'],
  double: ['.oooooo.', 'oo....oo', '......oo', '....ooo.', '..ooo...', '.oo.....', 'oooooooo', '........'],
};
export const KSPR = ['berry', 'gold', 'rewind', 'phase', 'magnet', 'double'];
const cache = {};
export function sprite(name, pal) {
  const key = name + pal.red + pal.cyan;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const x = c.getContext('2d'), col = { r: pal.red, g: '#3cdc3c', w: '#fff', y: pal.yellow, c: pal.cyan, p: pal.pink, o: pal.orange };
  SPR[name].forEach((row, y) => [...row].forEach((ch, i) => { if (col[ch]) { x.fillStyle = col[ch]; x.fillRect(i, y, 1, 1); } }));
  return (cache[key] = c);
}

let ditherPat = null;
export function dither(ctx, x, y, w, h) {
  if (!ditherPat) { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1); ditherPat = ctx.createPattern(c, 'repeat'); }
  ctx.fillStyle = ditherPat; ctx.fillRect(x, y, w, h);
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas; canvas.width = SW; canvas.height = SH;
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.pal = PALETTES.normal; this.particles = []; this.floaters = []; this.flash = 0; this.shake = 0; this.reduced = false; this.frameNo = 0;
  }

  events(evs, s) {
    const P = this.pal, col = [P.red, P.yellow, P.cyan, P.pink, P.white, P.orange];
    for (const e of evs) {
      if (e.t === 'eat') { this.burst(e.c, col[e.k], e.k ? 14 : 6); this.float(e.c, String(e.pts), e.k === 1 ? P.yellow : P.cyan); if (e.k === K.GOLD) this.shake = 120; }
      else if (e.t === 'cut') this.burst(e.c, P.orange, 3);
      else if (e.t === 'blast') this.burst(e.c, P.wall, 8);
      else if (e.t === 'level') this.flash = 900;
      else if (e.t === 'wind') { this.float(s.snake[0], 'SAVED!', P.white); this.shake = 200; }
      else if (e.t === 'rewind') this.float(s.snake[0], 'REWIND', P.cyan);
      else if (e.t === 'die') this.shake = 300;
    }
  }
  burst(c, color, n) {
    const x = BX + cx(c) * T + 4, y = BY + cy(c) * T + 4;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = Math.random() * 1.6 + .4;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 14 + Math.random() * 14 | 0, color }); }
  }
  float(c, str, color) { this.floaters.push({ x: BX + cx(c) * T + 4, y: BY + cy(c) * T, str, color, life: 50 }); }

  segs(s, alpha) {
    const p = s.dead || s.draft ? 1 : Math.min(1, (s.moveAcc + alpha * speed(s)) / 1000), prev = s.prevSnake || s.snake;
    return s.snake.map((c, i) => {
      const o = prev[i] ?? c, x0 = cx(o), y0 = cy(o), x1 = cx(c), y1 = cy(c);
      if (Math.abs(x1 - x0) > 1 || Math.abs(y1 - y0) > 1) return { x: x1, y: y1, jump: 1 };
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    });
  }

  // ── playfield ──────────────────────────────────────────────────────────
  playfield(v) {
    const { ctx } = this, P = this.pal, s = v.s, f = ++this.frameNo;
    ctx.save();
    if (this.shake > 0 && !this.reduced) ctx.translate((Math.random() * 3 | 0) - 1, (Math.random() * 3 | 0) - 1);
    ctx.fillStyle = '#000'; ctx.fillRect(BX, BY, W * T, H * T);
    ctx.fillStyle = P.dim;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ctx.fillRect(BX + x * T + 3, BY + y * T + 3, 2, 2);

    // border: double line; flashes white on level-up like a maze clear
    const flashing = this.flash > 0 && Math.floor(this.flash / 150) % 2 === 0;
    const bc = flashing ? P.white : wraps(s) ? P.pink : P.wall;
    ctx.fillStyle = bc;
    const box = (o, dash) => { const x0 = BX - o, y0 = BY - o, w = W * T + o * 2, h = H * T + o * 2;
      for (let i = 0; i < w; i++) if (!dash || ((i >> 2) & 1)) { ctx.fillRect(x0 + i, y0, 1, 1); ctx.fillRect(x0 + i, y0 + h - 1, 1, 1); }
      for (let i = 0; i < h; i++) if (!dash || ((i >> 2) & 1)) { ctx.fillRect(x0, y0 + i, 1, 1); ctx.fillRect(x0 + w - 1, y0 + i, 1, 1); } };
    box(2, wraps(s)); box(4, wraps(s));

    if (v.cycle) this.cycle(v.cycle);
    this.walls(s);
    this.foods(s, v.now);
    if (v.plan?.length) this.plan(v.planFrom, v.plan);
    if (v.ghost && f % 2) this.snake(v.ghost, v.alpha, v.now, 'ghost');
    if (s.phase === 0 || f % 2 === 0 || s.dead) this.snake(s, v.alpha, v.now, s.phase ? 'phase' : 'normal', v.deathT);

    this.particles = this.particles.filter(p => { p.x += p.vx; p.y += p.vy; p.vx *= .92; p.vy *= .92; return --p.life > 0; });
    for (const p of this.particles) { ctx.fillStyle = p.color; ctx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    this.floaters = this.floaters.filter(fl => { if (fl.life > 30 && f % 3 === 0) fl.y--; return --fl.life > 0; });
    for (const fl of this.floaters) text(ctx, fl.str, fl.x, fl.y, fl.color, { small: true, align: 'c' });
    ctx.restore();
    this.flash = Math.max(0, this.flash - 16); this.shake = Math.max(0, this.shake - 16);
  }

  cycle({ next }) {
    const { ctx } = this; ctx.fillStyle = '#0d2a40';
    let c = 0;
    for (let i = 0; i < N; i++) { const n = next[c], x0 = BX + cx(c) * T + 4, y0 = BY + cy(c) * T + 4, x1 = BX + cx(n) * T + 4, y1 = BY + cy(n) * T + 4;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1); c = n; }
  }
  plan(from, plan) {
    const { ctx } = this, P = this.pal, off = (performance.now() / 60 | 0);
    let px = from.x * T + 4, py = from.y * T + 4, k = 0;
    for (const c of plan) {
      const tx = cx(c) * T + 4, ty = cy(c) * T + 4;
      if (Math.abs(tx - px) > T * 1.5 || Math.abs(ty - py) > T * 1.5) { px = tx; py = ty; continue; }
      const steps = Math.max(Math.abs(tx - px), Math.abs(ty - py)) | 0;
      for (let i = 0; i < steps; i++, k++) if ((k + off) % 4 < 2) { ctx.fillStyle = P.cyan; ctx.fillRect(BX + Math.round(px + (tx - px) * i / steps), BY + Math.round(py + (ty - py) * i / steps), 1, 1); }
      px = tx; py = ty;
    }
    const e = plan[plan.length - 1]; ctx.strokeStyle = P.cyan; ctx.lineWidth = 1;
    ctx.strokeRect(BX + cx(e) * T - .5, BY + cy(e) * T - .5, 9, 9);
  }
  walls(s) {
    const { ctx } = this, P = this.pal, w = s.walls;
    for (let c = 0; c < N; c++) if (w[c]) {
      const x = cx(c), y = cy(c), px = BX + x * T, py = BY + y * T;
      ctx.fillStyle = s.phase ? '#05051a' : P.wallFill; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = P.wall;
      if (y === 0 || !w[c - W]) ctx.fillRect(px, py + 1, T, 1);
      if (y === H - 1 || !w[c + W]) ctx.fillRect(px, py + T - 2, T, 1);
      if (x === 0 || !w[c - 1]) ctx.fillRect(px + 1, py, 1, T);
      if (x === W - 1 || !w[c + 1]) ctx.fillRect(px + T - 2, py, 1, T);
    }
  }
  foods(s, now) {
    const { ctx } = this;
    for (const f of s.foods) {
      const age = s.tick - f.born;
      if (f.ttl && f.ttl - age < 60 && (now / 120 | 0) % 2) continue;
      const bob = f.k >= 2 && (now / 250 | 0) % 2 ? -1 : 0;
      ctx.drawImage(sprite(KSPR[f.k], this.pal), BX + cx(f.c) * T, BY + cy(f.c) * T + bob);
    }
  }
  snake(s, alpha, now, style, deathT = 0) {
    const { ctx } = this, P = this.pal, pts = this.segs(s, alpha), n = pts.length;
    const px = p => Math.round(BX + p.x * T), py = p => Math.round(BY + p.y * T);
    const gone = s.dead ? Math.floor(deathT / 45) : 0;           // death: segments pop from the tail
    const body = i => style === 'ghost' ? '#3a6aff' : style === 'phase' ? P.pink : s.dead ? P.white : P.snake[1 + ((i >> 1) & 1)];
    for (let i = n - 1; i > 0; i--) {
      if (i >= n - gone) continue;
      const a = pts[i], b = pts[i - 1];
      if (a.jump || b.jump || Math.abs(a.x - b.x) > 1.5 || Math.abs(a.y - b.y) > 1.5) continue;
      const inset = i === n - 1 ? 2 : 1;
      const x0 = Math.min(px(a), px(b)), y0 = Math.min(py(a), py(b)), x1 = Math.max(px(a), px(b)), y1 = Math.max(py(a), py(b));
      ctx.fillStyle = body(i); ctx.fillRect(x0 + inset, y0 + inset, x1 - x0 + T - inset * 2, y1 - y0 + T - inset * 2);
    }
    if (gone >= n) return;
    const h = pts[0], hx = px(h), hy = py(h), d = s.dir;
    ctx.fillStyle = style === 'ghost' ? '#7aa0ff' : style === 'phase' ? '#ffd6f2' : s.dead ? P.white : P.head;
    ctx.fillRect(hx + 1, hy, 6, 8); ctx.fillRect(hx, hy + 1, 8, 6);
    if (style === 'ghost') return;
    // eyes (2×2 dark with lit pixel toward heading)
    const ex = [[1, 1, 5, 1], [4, 1, 4, 5], [1, 5, 5, 5], [2, 1, 2, 5]][d];
    const lit = [[0, 0], [1, 0], [0, 1], [0, 0]][d];
    for (let k = 0; k < 2; k++) {
      const x = hx + ex[k * 2], y = hy + ex[k * 2 + 1];
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, 2, 2);
      if (s.dead) { ctx.fillStyle = P.red; ctx.fillRect(x, y, 2, 2); }
      else { ctx.fillStyle = '#fff'; ctx.fillRect(x + lit[0], y + lit[1], 1, 1); }
    }
    if (!s.dead && (now / 140 | 0) % 5 === 0) {           // tongue flick
      ctx.fillStyle = P.red;
      const tx = [[3, -3, 2, 3], [8, 3, 3, 2], [3, 8, 2, 3], [-3, 3, 3, 2]][d];
      ctx.fillRect(hx + tx[0], hy + tx[1], tx[2], tx[3]);
    }
  }

  // ── HUD ────────────────────────────────────────────────────────────────
  hud(h) {
    const { ctx } = this, P = this.pal, blink = (h.now / 280 | 0) % 2;
    if (!h.p1Blink || blink) text(ctx, '1UP', 32, 1, P.white, { align: 'c' });
    text(ctx, h.score, 56, 10, P.white, { align: 'r' });
    text(ctx, 'HIGH SCORE', 112, 1, P.white, { align: 'c' });
    text(ctx, h.hi, 136, 10, P.white, { align: 'r' });
    if (h.cpu != null) { text(ctx, h.cpuLabel, 176, 1, P.pink, { align: 'r', small: true }); text(ctx, h.cpu, 184, 10, P.pink, { align: 'r' }); }

    const s = h.s; if (!s) return;
    const y0 = BY + H * T + 7;
    text(ctx, 'LV', 8, y0, P.grey, { small: true }); text(ctx, String(s.level).padStart(2, '0'), 22, y0, P.white);
    text(ctx, 'COMBO', 48, y0, P.grey, { small: true }); text(ctx, 'x' + s.combo, 80, y0, s.combo > 1 ? P.yellow : P.white);
    const win = (Math.max(48, 90 - s.level * 3) * (s.perks.linger ? 3 : 2)) >> 1;
    const bw = 44, fill = s.comboT ? Math.round(bw * s.comboT / win) : 0;
    ctx.fillStyle = P.dim; ctx.fillRect(100, y0 + 2, bw, 3); ctx.fillStyle = s.combo > 1 ? P.yellow : P.grey; ctx.fillRect(100, y0 + 2, fill, 3);
    for (let i = 0; i < Math.min(4, s.level); i++) ctx.drawImage(sprite('berry', P), 184 - 8 - i * 9, y0 - 1);

    const y1 = y0 + 12;
    for (let i = 0; i < s.charges; i++) ctx.drawImage(sprite('rewind', P), 8 + i * 10, y1);
    let x = 60;
    for (const [name, v, max] of [['phase', s.phase, 150], ['magnet', s.magnet, 210], ['double', s.double, 240]]) {
      if (!v) continue; ctx.drawImage(sprite(name, P), x, y1);
      ctx.fillStyle = P.grey; ctx.fillRect(x + 10, y1 + 3, Math.ceil(20 * v / max), 2); x += 36;
    }
    const perks = Object.entries(s.perks).filter(([, n]) => n > 0).map(([id, n]) => PERKS.find(p => p.id === id).name.split(' ')[0].slice(0, 4) + (n > 1 ? n : ''));
    if (perks.length) text(ctx, perks.join(' '), 8, y1 + 12, P.grey, { small: true });
  }
}
