// Text screens drawn in the same 192×256 pixel space as the game.
import { text } from './font.js';
import { sprite, dither, SW, SH, BX, BY } from './render.js';
import { PERKS } from './engine.js';

const ROWCOL = ['#ff2a2a', '#ffa040', '#ffe14d', '#9cff57', '#2ee8ff', '#ffa0e8', '#ffffff', '#ff2a2a', '#ffa040', '#ffe14d'];
export const MODE_INFO = {
  classic: ['CLASSIC', 'WALLS KILL. PURE SKILL.'],
  portal:  ['PORTAL', 'EDGES WRAP AROUND.'],
  maze:    ['MAZE', 'NEW WALLS EVERY LEVEL.'],
  daily:   ['DAILY', 'SAME BOARD FOR EVERYONE.'],
  vsai:    ['VS CPU', 'RACE THE CPU ON ONE SEED.'],
  watch:   ['WATCH CPU', 'SEE THE ALGORITHM THINK.'],
};
export const MODE_ORDER = ['classic', 'portal', 'maze', 'daily', 'vsai', 'watch'];

const blink = (now, ms = 300) => (now / ms | 0) % 2 === 0;
const box = (ctx, x, y, w, h, col) => { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h); ctx.fillRect(x + 2, y + 2, w - 4, 1); ctx.fillRect(x + 2, y + h - 3, w - 4, 1); ctx.fillRect(x + 2, y + 2, 1, h - 4); ctx.fillRect(x + w - 3, y + 2, 1, h - 4); };

export function credit(ctx, P, ui) {
  text(ctx, ui.freePlay ? 'FREE PLAY' : 'CREDIT ' + String(ui.credits).padStart(2, '0'), 8, SH - 9, P.white, { small: true });
  if (ui.modeLabel) text(ctx, ui.modeLabel, SW - 8, SH - 9, P.grey, { small: true, align: 'r' });
}
const pushStart = (ctx, P, ui, now, y) => {
  if (!blink(now, 450)) return;
  if (ui.freePlay || ui.credits > 0) text(ctx, 'PUSH START BUTTON', SW / 2, y, P.orange, { align: 'c' });
  else text(ctx, 'INSERT COIN', SW / 2, y, P.orange, { align: 'c' });
};

export function title(ctx, P, ui, now, t) {
  // logo with hard drop shadow
  for (const [dx, dy, c] of [[2, 2, '#7a0000'], [0, 0, P.red]]) text(ctx, 'NEON', SW / 2 + dx, 46 + dy, c, { scale: 4, align: 'c' });
  for (const [dx, dy, c] of [[1, 1, '#0a5a14'], [0, 0, '#9cff57']]) text(ctx, 'SERPENT', SW / 2 + dx, 84 + dy, c, { scale: 3, align: 'c' });
  // little snake chasing a berry across the screen
  const span = SW + 80, x = ((t / 14) % span) - 60;
  const bx = Math.round(x + 40);
  if (bx < SW) ctx.drawImage(sprite('berry', P), bx, 128);
  for (let i = 0; i < 6; i++) { const sx = Math.round(x - i * 7), sy = 129 + ((i + (t / 120 | 0)) % 2); ctx.fillStyle = i ? P.snake[1 + ((i >> 1) & 1)] : P.head; ctx.fillRect(sx, sy, 7, 6); }
  pushStart(ctx, P, ui, now, 160);
  text(ctx, '1 PLAYER ONLY', SW / 2, 184, P.cyan, { align: 'c', small: true });
  text(ctx, 'BONUS REWIND FOR EVERY CLOCK', SW / 2, 196, P.grey, { align: 'c', small: true });
  text(ctx, '(C)2026 SERPENT WORKS', SW / 2, 226, P.white, { align: 'c', small: true });
}

const ITEMS = [['berry', 'BERRY', '10 PTS', 'red'], ['gold', 'GOLDEN', '50 PTS', 'yellow'], ['rewind', 'CLOCK', 'REWIND', 'cyan'], ['phase', 'PHASE', 'GHOSTLY', 'pink'], ['magnet', 'MAGNET', 'PULL', 'white'], ['double', 'DOUBLE', 'x2 PTS', 'orange']];
export function items(ctx, P, ui, now, t) {
  text(ctx, 'PICKUP  -  EFFECT', SW / 2, 36, P.white, { align: 'c' });
  const shown = Math.min(ITEMS.length, (t / 450 | 0));
  ITEMS.slice(0, shown).forEach(([spr, name, eff, col], i) => {
    const y = 60 + i * 20;
    ctx.drawImage(sprite(spr, P), 24, y);
    text(ctx, '-' + name, 40, y, P[col]);
    text(ctx, eff, SW - 16, y, P[col], { align: 'r' });
  });
  if (shown >= ITEMS.length) {
    text(ctx, 'CHAIN BITES FOR UP TO x8', SW / 2, 190, P.yellow, { align: 'c', small: true });
    text(ctx, 'EVERY 5 BITES: CHOOSE A POWER', SW / 2, 202, P.yellow, { align: 'c', small: true });
  }
  pushStart(ctx, P, ui, now, 222);
}

export function scores(ctx, P, ui, now, table) {
  text(ctx, 'THE BEST 10', SW / 2, 30, P.white, { align: 'c' });
  text(ctx, 'RANK  SCORE  NAME', SW / 2, 50, P.cyan, { align: 'c' });
  table.slice(0, 10).forEach((e, i) => {
    const y = 66 + i * 14, c = ROWCOL[i];
    const rk = ['1ST', '2ND', '3RD'][i] || (i + 1) + 'TH';
    text(ctx, rk.padStart(4), 20, y, c);
    text(ctx, String(e.s).padStart(6), 64, y, c);
    text(ctx, e.i, 128, y, c);
    text(ctx, (MODE_INFO[e.m]?.[0] || '').slice(0, 1), 168, y, P.grey, { small: true });
  });
  pushStart(ctx, P, ui, now, 220);
}

export function demoBanner(ctx, P, ui, now) {
  text(ctx, 'DEMO PLAY', SW / 2, BY + 6, P.white, { align: 'c', small: true });
  if (blink(now, 450)) { ctx.fillStyle = '#000'; ctx.fillRect(SW / 2 - 72, BY + 80, 144, 16); pushStart(ctx, P, ui, now + 0, BY + 84); }
}

export function select(ctx, P, ui, now, sel, best) {
  dither(ctx, 0, 0, SW, SH);
  box(ctx, 12, 40, SW - 24, 172, P.wall);
  text(ctx, 'SELECT GAME', SW / 2, 52, P.yellow, { align: 'c' });
  MODE_ORDER.forEach((m, i) => {
    const y = 74 + i * 16, on = i === sel;
    if (on && blink(now, 250)) text(ctx, '}', 24, y, P.red);
    text(ctx, MODE_INFO[m][0], 38, y, on ? P.white : P.grey);
    if (best[m]) text(ctx, String(best[m]), SW - 24, y + 1, on ? P.cyan : P.dim, { small: true, align: 'r' });
  });
  text(ctx, MODE_INFO[MODE_ORDER[sel]][1], SW / 2, 178, P.cyan, { align: 'c', small: true });
  text(ctx, 'UP/DOWN  START TO PLAY', SW / 2, 196, P.grey, { align: 'c', small: true });
}

export function ready(ctx, P, label) {
  text(ctx, label || 'PLAYER ONE', SW / 2, BY + 64, P.cyan, { align: 'c' });
  text(ctx, 'READY!', SW / 2, BY + 104, P.yellow, { align: 'c' });
}

export function draft(ctx, P, now, s, sel) {
  dither(ctx, BX, BY, 176, 176);
  box(ctx, 14, 44, SW - 28, 156, P.wall);
  text(ctx, 'LEVEL ' + String(s.level).padStart(2, '0'), SW / 2, 56, P.yellow, { align: 'c' });
  text(ctx, 'CHOOSE A POWER', SW / 2, 70, P.white, { align: 'c', small: true });
  s.draft.forEach((p, i) => {
    const y = 90 + i * 34, on = i === sel, perk = PERKS[p], own = s.perks[perk.id];
    if (on) { ctx.fillStyle = '#10104a'; ctx.fillRect(20, y - 4, SW - 40, 30); }
    if (on && blink(now, 250)) text(ctx, '}', 24, y, P.red);
    text(ctx, (i + 1) + ' ' + perk.name, 36, y, on ? P.white : P.grey);
    if (own) text(ctx, 'x' + own, SW - 26, y, P.yellow, { align: 'r', small: true });
    wrap(perk.desc, 23).forEach((ln, k) => text(ctx, ln, 36, y + 11 + k * 8, on ? P.cyan : '#4a4a6a', { small: true }));
  });
}

export function cont(ctx, P, now, n, charges) {
  dither(ctx, BX, BY, 176, 176);
  box(ctx, 28, 70, SW - 56, 96, P.cyan);
  text(ctx, 'REWIND?', SW / 2, 84, P.cyan, { align: 'c' });
  text(ctx, String(n), SW / 2, 102, P.white, { align: 'c', scale: 3 });
  text(ctx, 'PUSH START', SW / 2, 136, blink(now, 200) ? P.yellow : P.orange, { align: 'c', small: true });
  text(ctx, charges + ' CLOCK' + (charges > 1 ? 'S' : '') + ' LEFT', SW / 2, 148, P.grey, { align: 'c', small: true });
}

export function gameOver(ctx, P) {
  ctx.fillStyle = '#000'; ctx.fillRect(SW / 2 - 44, BY + 100, 88, 15);
  text(ctx, 'GAME  OVER', SW / 2, BY + 104, P.red, { align: 'c' });
}

export function initials(ctx, P, now, ini, pos, score, rank) {
  dither(ctx, 0, 0, SW, SH); box(ctx, 12, 40, SW - 24, 176, P.wall);
  text(ctx, 'CONGRATULATIONS!', SW / 2, 54, P.yellow, { align: 'c' });
  text(ctx, 'YOU RANK ' + rank + ' OF 10', SW / 2, 70, P.white, { align: 'c', small: true });
  text(ctx, String(score), SW / 2, 86, P.white, { align: 'c', scale: 2 });
  text(ctx, 'ENTER YOUR INITIALS', SW / 2, 116, P.cyan, { align: 'c', small: true });
  for (let i = 0; i < 3; i++) {
    const x = SW / 2 - 30 + i * 24, on = i === pos;
    text(ctx, ini[i], x, 134, on ? P.yellow : P.white, { scale: 2 });
    if (on && blink(now, 200)) { ctx.fillStyle = P.yellow; ctx.fillRect(x, 152, 10, 2); }
  }
  text(ctx, 'UP/DOWN LETTER  START OK', SW / 2, 176, P.grey, { align: 'c', small: true });
}

export function results(ctx, P, now, r, toast) {
  dither(ctx, 0, 0, SW, SH); box(ctx, 12, 30, SW - 24, 194, P.wall);
  text(ctx, r.title, SW / 2, 42, r.record ? P.yellow : P.red, { align: 'c' });
  const rows = [['SCORE', r.score, P.white], ['LENGTH', r.length, P.white], ['MAX COMBO', 'x' + r.combo, P.yellow], ['LEVEL', r.level, P.white]];
  rows.forEach(([k, v, c], i) => { text(ctx, k, 28, 64 + i * 14, P.grey); text(ctx, v, SW - 28, 64 + i * 14, c, { align: 'r' }); });
  if (r.vs) text(ctx, r.vs, SW / 2, 126, r.win ? P.cyan : P.pink, { align: 'c', small: true });
  const opts = [['START', 'PLAY AGAIN'], ['S', 'SHARE REPLAY'], ['ESC', 'MAIN MENU']];
  opts.forEach(([k, v], i) => { text(ctx, k, 28, 146 + i * 14, P.orange, { small: true }); text(ctx, v, 66, 146 + i * 14, P.white, { small: true }); });
  if (toast) text(ctx, toast, SW / 2, 196, P.cyan, { align: 'c', small: true });
}

export function tape(ctx, P, now, rp) {
  dither(ctx, 0, 0, SW, SH); box(ctx, 12, 36, SW - 24, 184, P.wall);
  text(ctx, 'REPLAY TAPE', SW / 2, 48, P.yellow, { align: 'c' });
  const m = rp.meta;
  [['MODE', MODE_INFO[m.mode]?.[0] || m.mode], ['SEED', m.seed.toString(16).toUpperCase()], ['INPUTS', rp.log.length], ['SIZE', rp.chars + ' CHR'], ['CLAIM', m.score]]
    .forEach(([k, v], i) => { text(ctx, k, 26, 70 + i * 12, P.grey, { small: true }); text(ctx, v, SW - 26, 70 + i * 12, P.white, { small: true, align: 'r' }); });
  if (rp.ok) { if (blink(now, 500)) text(ctx, 'VERIFIED', SW / 2, 136, P.snake[0], { align: 'c' }); text(ctx, 'RE-SIMULATED ' + rp.ticks + ' TICKS', SW / 2, 150, P.grey, { align: 'c', small: true }); }
  else { text(ctx, 'TAMPERED', SW / 2, 136, P.red, { align: 'c' }); text(ctx, 'ENGINE SAYS ' + rp.real, SW / 2, 150, P.grey, { align: 'c', small: true }); }
  [['START', 'WATCH'], ['R', 'RACE THE GHOST'], ['ESC', 'EXIT']].forEach(([k, v], i) => { text(ctx, k, 30, 170 + i * 12, P.orange, { small: true }); text(ctx, v, 70, 170 + i * 12, P.white, { small: true }); });
}

export function service(ctx, P, now, items, sel) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SW, SH);
  text(ctx, 'SERVICE MODE', SW / 2, 16, P.white, { align: 'c' });
  text(ctx, 'DIP SWITCH SETTINGS', SW / 2, 30, P.grey, { align: 'c', small: true });
  // dip switch bank graphic
  items.forEach((it, i) => { const x = 40 + i * 16; ctx.fillStyle = '#7a0000'; ctx.fillRect(x, 44, 10, 18); ctx.fillStyle = '#fff'; ctx.fillRect(x + 2, it.on ? 46 : 54, 6, 6); text(ctx, String(i + 1), x + 2, 66, P.grey, { small: true }); });
  items.forEach((it, i) => {
    const y = 90 + i * 14, on = i === sel;
    if (on) text(ctx, '}', 10, y, P.red);
    text(ctx, it.label, 22, y, on ? P.white : P.grey, { small: true });
    text(ctx, it.value, SW - 12, y, on ? P.yellow : P.grey, { small: true, align: 'r' });
  });
  text(ctx, 'UP/DOWN SELECT  LEFT/RIGHT SET', SW / 2, 214, P.cyan, { align: 'c', small: true });
  text(ctx, 'ESC TO EXIT', SW / 2, 226, P.cyan, { align: 'c', small: true });
}

export function pause(ctx, P, now) {
  if (!blink(now, 400)) return;
  ctx.fillStyle = '#000'; ctx.fillRect(SW / 2 - 28, BY + 100, 56, 15);
  text(ctx, 'PAUSE', SW / 2, BY + 104, P.yellow, { align: 'c' });
}

function wrap(str, n) { const out = []; let cur = ''; for (const w of str.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; }
