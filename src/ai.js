// ─────────────────────────────────────────────────────────────────────────────
// AI pilot. Pure function of game state → input code. Deterministic.
//
// Open boards (classic / portal): Hamiltonian cycle + safe shortcuts.
//   A 22×22 board has a Hamiltonian cycle because a side is even. We build it
//   from a random spanning tree on the 11×11 half-grid (seeded), which gives an
//   organic-looking loop instead of a boring zig-zag.
//   Shortcut rule: we may jump ahead along the cycle as long as we land
//   strictly before the first body cell ahead of the head, with a safety margin.
//   Past SHORTCUT_LIMIT board fill, we follow the cycle exactly → can't die.
//
// Walled boards (maze): cycle guarantee breaks, so A* to food + a flood check
//   that a virtual snake that ate the food can still reach its own tail.
//   Otherwise chase the tail; otherwise pick the largest reachable region.
// ─────────────────────────────────────────────────────────────────────────────
import { W, H, N, DX, DY, cx, cy, PERKS } from './engine.js';

export const SHORTCUT_LIMIT = 0.55;

export function buildCycle(seed) {
  const BW = W >> 1, BH = H >> 1;
  let r = seed ^ 0x9e3779b9;
  const rand = n => { r = (r + 0x6D2B79F5) | 0; let t = Math.imul(r ^ (r >>> 15), r | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) % n; };

  // 1) every 2×2 block starts as its own clockwise 4-cycle
  const next = new Int16Array(N);
  const id = (x, y) => y * W + x;
  for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
    const x = bx * 2, y = by * 2;
    next[id(x, y)] = id(x + 1, y); next[id(x + 1, y)] = id(x + 1, y + 1);
    next[id(x + 1, y + 1)] = id(x, y + 1); next[id(x, y + 1)] = id(x, y);
  }
  // 2) random spanning tree on blocks (iterative DFS); each tree edge merges two cycles
  const seen = new Uint8Array(BW * BH), stack = [rand(BW * BH)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const b = stack[stack.length - 1], bx = b % BW, by = (b / BW) | 0;
    const opts = [];
    if (bx + 1 < BW && !seen[b + 1]) opts.push([b + 1, 'R']);
    if (bx > 0 && !seen[b - 1]) opts.push([b - 1, 'L']);
    if (by + 1 < BH && !seen[b + BW]) opts.push([b + BW, 'D']);
    if (by > 0 && !seen[b - BW]) opts.push([b - BW, 'U']);
    if (!opts.length) { stack.pop(); continue; }
    const [nb, d] = opts[rand(opts.length)];
    seen[nb] = 1; stack.push(nb);
    const [A, B, dir] = d === 'L' || d === 'U' ? [nb, b, d === 'L' ? 'R' : 'D'] : [b, nb, d];
    const ax = (A % BW) * 2, ay = ((A / BW) | 0) * 2, bx2 = (B % BW) * 2, by2 = ((B / BW) | 0) * 2;
    if (dir === 'R') { // A left of B: swap A.TR→A.BR and B.BL→B.TL
      next[id(ax + 1, ay)] = id(bx2, by2);
      next[id(bx2, by2 + 1)] = id(ax + 1, ay + 1);
    } else {           // A above B: swap A.BR→A.BL and B.TL→B.TR
      next[id(ax + 1, ay + 1)] = id(bx2 + 1, by2);
      next[id(bx2, by2)] = id(ax, ay + 1);
    }
  }
  const ord = new Int16Array(N);
  for (let c = 0, i = 0; i < N; i++, c = next[c]) ord[c] = i;
  return { next, ord };
}

const dirTo = (a, b) => {
  const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
  if (dx === 1 || dx < -1) return 1; if (dx === -1 || dx > 1) return 3;
  return dy === 1 || dy < -1 ? 2 : 0;
};

function neighbors(c, wrap) {
  const out = [], x = cx(c), y = cy(c);
  for (let d = 0; d < 4; d++) {
    let nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { if (!wrap) continue; nx = (nx + W) % W; ny = (ny + H) % H; }
    out.push(ny * W + nx);
  }
  return out;
}

// BFS from `from`; blocked[c] = tick at which cell frees up (body index from tail)
function bfs(from, blocked, wrap, goal) {
  const prev = new Int16Array(N).fill(-1), dist = new Int16Array(N).fill(-1);
  const q = [from]; dist[from] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (goal(c) && c !== from) {
      const path = []; for (let p = c; p !== from; p = prev[p]) path.push(p);
      return { path: path.reverse(), dist, count: q.length };
    }
    for (const n of neighbors(c, wrap)) {
      if (dist[n] >= 0 || blocked[n] > dist[c]) continue; // body cell frees after `blocked` moves
      dist[n] = dist[c] + 1; prev[n] = c; q.push(n);
    }
  }
  return { path: null, dist, count: q.length };
}

function bodyMap(snake, walls, grow) {
  const b = new Int16Array(N);
  for (let c = 0; c < N; c++) if (walls[c]) b[c] = 9999;
  const L = snake.length;
  for (let i = 0; i < L; i++) b[snake[i]] = Math.max(b[snake[i]], L - i + grow - 1); // frees after this many moves
  return b;
}

export class Pilot {
  constructor(seed) { this.cyc = buildCycle(seed); this.plan = []; this.mode = 'cycle'; this.ms = 0; }

  decide(s) {
    if (s.draft) {                         // perk preference for the bot
      const pref = ['linger', 'greed', 'velvet', 'wind', 'hoard', 'lean', 'demo', 'ghosttail'];
      let best = 0;
      s.draft.forEach((p, i) => { if (pref.indexOf(PERKS[p].id) < pref.indexOf(PERKS[s.draft[best]].id)) best = i; });
      return 10 + best;
    }
    if (s.queue.length || s.dead) return -1;
    const t0 = performance.now();
    const hasWalls = s.walls.some(Boolean);
    const n = hasWalls ? this.astar(s) : this.cycle(s);
    this.ms = performance.now() - t0;
    if (n < 0) return -1;
    const d = dirTo(s.snake[0], n);
    return d === s.dir ? -1 : d;
  }

  cycle(s) {
    const { next, ord } = this.cyc, h = s.snake[0], L = s.snake.length;
    const dist = (a, b) => (ord[b] - ord[a] + N) % N;
    const tailFree = s.grow === 0;
    // first body cell ahead of the head along the cycle
    let ahead = N;
    for (let i = 1; i < L - (tailFree ? 1 : 0); i++) ahead = Math.min(ahead, dist(h, s.snake[i]));
    if (tailFree) ahead = Math.min(ahead, dist(h, s.snake[L - 1]) + 1);
    let target = s.foods[0]?.c ?? next[h], best = N;
    for (const f of s.foods) { const d = dist(h, f.c); if (d < best) { best = d; target = f.c; } }

    const occupied = new Uint8Array(N);
    for (let i = 0; i < L - (tailFree ? 1 : 0); i++) occupied[s.snake[i]] = 1;
    const shortcuts = (L + s.grow) / N < SHORTCUT_LIMIT;
    const margin = s.grow + 3;
    let pick = -1, pickD = N;
    for (const n of neighbors(h, false)) {
      if (occupied[n]) continue;
      const dn = dist(h, n);
      const ok = n === next[h] ? dn < ahead : (shortcuts && dn < ahead - margin);
      if (!ok) continue;
      const dt = dist(n, target);
      if (dt < pickD) { pickD = dt; pick = n; }
    }
    if (pick < 0) { this.mode = 'survive'; return this.survive(s); }
    this.mode = pick === next[h] ? 'cycle' : 'shortcut';
    // plan for the visualizer: from pick, follow cycle to target
    this.plan = [pick];
    for (let c = pick, k = 0; c !== target && k < 120; k++) { c = next[c]; this.plan.push(c); }
    return pick;
  }

  astar(s) {
    const h = s.snake[0], wrap = s.mode === 'portal';
    const blocked = bodyMap(s.snake, s.walls, s.grow);
    const foodSet = new Set(s.foods.map(f => f.c));
    const r = bfs(h, blocked, wrap, c => foodSet.has(c));
    if (r.path) {
      // simulate the snake after eating, then check it can still reach its tail
      const body = s.snake.slice(); let grow = s.grow;
      for (const c of r.path) { body.unshift(c); if (grow > 0) grow--; else body.pop(); }
      body.push(body[body.length - 1]);             // food makes it grow by one
      if (this.canReachTail(body, s.walls, wrap)) { this.mode = 'A*'; this.plan = r.path; return r.path[0]; }
    }
    // stall: follow tail with the longest safe route
    let pick = -1, far = -1;
    for (const n of neighbors(h, wrap)) {
      if (blocked[n] > 0) continue;
      const body = [n, ...s.snake.slice(0, s.grow > 0 ? undefined : -1)];
      if (!this.canReachTail(body, s.walls, wrap)) continue;
      const tail = s.snake[s.snake.length - 1];
      const d = Math.abs(cx(n) - cx(tail)) + Math.abs(cy(n) - cy(tail));
      if (d > far) { far = d; pick = n; }
    }
    if (pick >= 0) { this.mode = 'tail-chase'; this.plan = [pick, s.snake[s.snake.length - 1]]; return pick; }
    this.mode = 'survive';
    return this.survive(s);
  }

  canReachTail(body, walls, wrap) {
    const blocked = bodyMap(body, walls, 0), tail = body[body.length - 1];
    blocked[tail] = 0;
    return !!bfs(body[0], blocked, wrap, c => c === tail).path;
  }

  survive(s) {                                       // biggest flood-fill region
    const h = s.snake[0], wrap = s.mode === 'portal' || s.phase > 0;
    const blocked = bodyMap(s.snake, s.walls, s.grow);
    let pick = -1, most = -1;
    for (const n of neighbors(h, wrap)) {
      if (blocked[n] > 0) continue;
      const b2 = blocked.slice(); b2[h] = 9999;
      const { count } = bfs(n, b2, wrap, () => false);
      if (count > most) { most = count; pick = n; }
    }
    this.plan = pick >= 0 ? [pick] : [];
    return pick;
  }
}
