// Cabinet shell: actions → state machine → step() → pixel renderer → CRT.
// Owns no game rules; the engine is untouched by the UI.
import { create, step, hash, TPS, IN, dailySeed, speed } from './engine.js';
import { Pilot } from './ai.js';
import { encode, decode, simulate, Cursor } from './replay.js';
import { Renderer, PALETTES, SW, SH } from './render.js';
import * as UI from './screens.js';
import { text } from './font.js';
import { createPost } from './post.js';
import { Sound } from './sound.js';

const $ = id => document.getElementById(id);
const DT = 1000 / TPS;
const engineMode = m => (m === 'portal' || m === 'maze' ? m : 'classic');
const today = () => new Date().toISOString().slice(0, 10);

// ── display: low-res scene → WebGL2 CRT, or pixelated canvas fallback ─────
const screenEl = $('screen'), glCanvas = $('gl');
const scene = document.createElement('canvas');
const R = new Renderer(scene), ctx = R.ctx;
let post = null;
try { post = createPost(glCanvas, scene); } catch { post = null; }
if (!post) { glCanvas.replaceWith(scene); scene.id = 'gl'; scene.classList.add('fallback'); }
function resize() { const r = screenEl.getBoundingClientRect(); post?.size(Math.round(r.width * Math.min(devicePixelRatio || 1, 2)), Math.round(r.height * Math.min(devicePixelRatio || 1, 2))); }
addEventListener('resize', resize);

// ── persistent settings (DIP switches) + high-score table ─────────────────
const dip = Object.assign({ freePlay: true, sound: true, palette: 'normal', reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, aiPath: true },
  JSON.parse(localStorage.getItem('ns3_dip') || '{}'));
function applyDip() {
  R.pal = PALETTES[dip.palette]; R.reduced = dip.reduced; Sound.muted = !dip.sound;
  if (post) { post.opts.curve = dip.reduced ? 0 : .06; post.opts.flicker = dip.reduced ? 0 : 1; }
  localStorage.setItem('ns3_dip', JSON.stringify(dip));
}
const DEFAULT_HI = [['SRP', 8000], ['NEO', 6500], ['AKS', 5200], ['HAM', 4100], ['CYC', 3300], ['BFS', 2500], ['MUL', 1800], ['RNG', 1200], ['TCK', 800], ['GHO', 400]].map(([i, s]) => ({ i, s, m: 'classic' }));
let hiTable = JSON.parse(localStorage.getItem('ns3_hi') || 'null') || DEFAULT_HI;
const hiScore = () => hiTable[0]?.s || 0;
const bestByMode = () => { const b = {}; for (const e of hiTable) b[e.m] = Math.max(b[e.m] || 0, e.s); return b; };

// ── session state ─────────────────────────────────────────────────────────
let phase = 'attract', phaseT = 0;          // ms since entering phase
let G = null, credits = 0, acc = 0, last = 0;
let attractIdx = 0, selIdx = 0, draftSel = 0, contN = 9, ini = ['A', 'A', 'A'], iniPos = 0, rankPos = 0;
let result = null, toast = '', toastT = 0, replaySpeed = 1, loadedReplay = null, serviceSel = 0, debug = false, showCycle = false;
const stats = { frames: [], stepUs: 0, aiMs: 0 };
const ATTRACT = ['title', 'items', 'scores', 'demo'];
const go = p => { phase = p; phaseT = 0; };

function newSession(mode, seed, opts = {}) {
  const meta = { mode, seed: seed >>> 0 };
  const g = { meta, s: create(meta.seed, engineMode(mode)), log: [], pending: [], snaps: [], human: true, pilot: null, ghost: null };
  if (opts.bot || mode === 'watch') { g.human = false; g.pilot = new Pilot(meta.seed); }
  if (mode === 'vsai') g.ghost = { s: create(meta.seed, 'classic'), pilot: new Pilot(meta.seed), label: 'CPU' };
  if (opts.ghostLog) g.ghost = { s: create(meta.seed, engineMode(mode)), cursor: new Cursor(opts.ghostLog), label: opts.ghostLabel || 'GHOST' };
  return g;
}

function startGame(mode, seed, opts = {}) {
  if (!dip.freePlay) { if (credits <= 0) return; credits--; }
  Sound.init(); Sound.start();
  if (seed == null) seed = mode === 'daily' ? dailySeed(today()) : crypto.getRandomValues(new Uint32Array(1))[0];
  if (mode === 'daily' && !opts.ghostLog) { const b = JSON.parse(localStorage.getItem('ns3_daily_' + today()) || 'null'); if (b) { opts.ghostLog = b.log; opts.ghostLabel = 'BEST'; } }
  G = newSession(mode, seed, opts); G.mode = mode;
  history.replaceState(null, '', location.pathname);
  showCycle = mode === 'watch';
  R.particles = []; R.floaters = [];
  go('ready');
}

function demo() { G = newSession('watch', (Math.random() * 2 ** 32) >>> 0, { bot: true }); G.demo = true; acc = 0; }

// ── simulation tick ───────────────────────────────────────────────────────
function tickOnce() {
  const g = G; let ins;
  if (g.cursor) ins = g.cursor.at(g.s.tick);
  else if (g.pilot) { const c = g.pilot.decide(g.s); ins = c >= 0 ? [c] : []; stats.aiMs = g.pilot.ms; }
  else { ins = g.pending; g.pending = []; }
  if (!g.cursor) for (const c of ins) g.log.push([g.s.tick, c]);
  const t0 = performance.now(); g.s = step(g.s, ins); stats.stepUs = (performance.now() - t0) * 1000;
  if (g.s.tick % 15 === 0 && !g.s.dead && !g.cursor) { g.snaps.push({ s: g.s, logLen: g.log.length }); if (g.snaps.length > 40) g.snaps.shift(); }
  R.events(g.s.ev, g.s);
  if (!g.demo) sfx(g.s.ev);
  if (g.ghost && !g.ghost.s.dead) { const gh = g.ghost; gh.s = step(gh.s, gh.pilot ? [gh.pilot.decide(gh.s)].filter(c => c >= 0) : gh.cursor.at(gh.s.tick)); }
  if (g.s.draft && g.human && phase === 'play') { draftSel = 0; go('draft'); Sound.level(); }
  if (g.s.dead && !g.demo) { go('dying'); if (!g.human || g.cursor) G.endAfter = true; }
}
function sfx(evs) {
  for (const e of evs) {
    if (e.t === 'eat') e.k === 1 ? Sound.golden() : e.k >= 2 ? Sound.power() : Sound.eat(e.combo);
    else if (e.t === 'die') { Sound.die(); rumble(400, 1); }
    else if (e.t === 'rewind') Sound.rewind();
    else if (e.t === 'wind') Sound.power();
  }
}

function rewindSnap() {
  const g = G; if (!g || !g.human || g.cursor || g.s.charges <= 0) return null;
  for (let i = g.snaps.length - 1; i >= 0; i--) { const sn = g.snaps[i]; if (sn.s.tick <= g.s.tick - 75 && sn.s.charges > 0) return { sn, i }; }
  return null;
}
function doRewind() {
  const r = rewindSnap(); if (!r) return false;
  G.s = r.sn.s; G.log.length = r.sn.logLen; G.snaps.length = r.i + 1; G.pending = [IN.REWIND];
  R.particles = []; acc = 0; go('play'); return true;
}

function finishRun() {
  const g = G, s = g.s;
  if (g.mode === 'daily') { const b = JSON.parse(localStorage.getItem('ns3_daily_' + today()) || 'null'); if (!b || s.score > b.score) localStorage.setItem('ns3_daily_' + today(), JSON.stringify({ score: s.score, log: g.log })); }
  result = { title: 'GAME OVER', record: false, score: s.score, length: s.snake.length, combo: s.maxCombo, level: s.level };
  if (g.ghost) { const gs = g.ghost.s.score; result.win = s.score > gs; result.vs = `${g.ghost.label} ${gs}  -  ${result.win ? 'YOU WIN' : 'YOU LOSE'}`; }
  rankPos = hiTable.findIndex(e => s.score > e.s);
  if (rankPos < 0 && hiTable.length < 10) rankPos = hiTable.length;
  if (g.human && rankPos >= 0 && s.score > 0) { ini = ['A', 'A', 'A']; iniPos = 0; result.record = rankPos === 0; if (result.record) result.title = 'NEW RECORD!'; go('initials'); }
  else go('results');
}

// ── per-phase timing ──────────────────────────────────────────────────────
function updatePhase(dt) {
  phaseT += dt;
  switch (phase) {
    case 'attract': {
      const dur = ATTRACT[attractIdx] === 'demo' ? 1e9 : ATTRACT[attractIdx] === 'items' ? 6500 : 5500;
      if (ATTRACT[attractIdx] === 'demo' && (!G?.demo)) demo();
      if (ATTRACT[attractIdx] === 'demo' && G.s.dead && (G.deadAt ??= phaseT) && phaseT - G.deadAt > 1800) nextAttract();
      if (ATTRACT[attractIdx] === 'demo' && phaseT > 45000) nextAttract();
      if (phaseT > dur) nextAttract();
      break;
    }
    case 'ready': if (phaseT > (G.mode === 'watch' ? 600 : 2000)) { go('play'); acc = 0; } break;
    case 'dying':
      if (phaseT > 1400) {
        if (G.endAfter) { if (G.cursor) { go('tape'); } else { go('select'); } break; }
        if (rewindSnap()) { contN = 9; go('continue'); } else go('gameover');
      }
      break;
    case 'continue': { const n = 9 - Math.floor(phaseT / 1000); if (n !== contN) { contN = n; if (n >= 0) Sound.count(1); } if (n < 0) go('gameover'); break; }
    case 'gameover': if (phaseT > 2200) finishRun(); break;
    case 'results': if (phaseT > 30000) toAttract(); break;
    case 'select': if (phaseT > 30000) toAttract(); break;
  }
  if (toastT > 0) toastT -= dt;
}
function nextAttract() { attractIdx = (attractIdx + 1) % ATTRACT.length; phaseT = 0; if (ATTRACT[attractIdx] !== 'demo') { G = null; } else demo(); }
function toAttract() { attractIdx = 0; G = null; go('attract'); }

// ── actions (keyboard, cabinet buttons, gamepad all funnel here) ──────────
function act(a) {
  Sound.init();
  if (a === 'coin') { credits = Math.min(99, credits + 1); Sound.coin(); return; }
  if (a === 'service') { if (phase === 'service') { applyDip(); toAttract(); } else { serviceSel = 0; G = null; go('service'); } return; }
  const dir = { up: 0, right: 1, down: 2, left: 3 }[a];
  switch (phase) {
    case 'attract':
      if (a === 'a') { if (dip.freePlay || credits > 0) { Sound.menu(); G = null; go('select'); } }
      break;
    case 'select':
      if (a === 'up') { selIdx = (selIdx + 5) % 6; Sound.menu(); }
      else if (a === 'down') { selIdx = (selIdx + 1) % 6; Sound.menu(); }
      else if (a === 'a') startGame(UI.MODE_ORDER[selIdx]);
      else if (a === 'back') toAttract();
      break;
    case 'play':
      if (dir != null && G.human && !G.cursor) { G.pending.push(dir); Sound.turn(); }
      else if (a === 'b') doRewind();
      else if (a === 'pause' && G.human) { go('paused'); Sound.menu(); }
      else if (a === 'back') { if (G.human) go('paused'); else { G = null; go('select'); } }
      break;
    case 'replay':
      if (a === 'back') go('tape');
      break;
    case 'paused':
      if (a === 'pause' || a === 'a') go('play');
      else if (a === 'back') { G = null; go('select'); }
      break;
    case 'draft':
      if (a === 'up') { draftSel = (draftSel + 2) % 3; Sound.menu(); }
      else if (a === 'down') { draftSel = (draftSel + 1) % 3; Sound.menu(); }
      else if (a === 'a') pickPerk(draftSel);
      else if (a.startsWith?.('n')) pickPerk(+a.slice(1));
      break;
    case 'continue':
      if (a === 'a' || a === 'b') { doRewind(); }
      else if (a === 'back') go('gameover');
      break;
    case 'gameover': if (a === 'a' && phaseT > 600) finishRun(); break;
    case 'initials': {
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ .!'.split('');
      if (a === 'up' || a === 'down') { const k = L.indexOf(ini[iniPos]); ini[iniPos] = L[(k + (a === 'up' ? 1 : L.length - 1)) % L.length]; Sound.menu(); }
      else if (a === 'right' || a === 'a') { if (iniPos < 2) { iniPos++; Sound.turn(); } else saveInitials(); }
      else if (a === 'left' && iniPos > 0) iniPos--;
      else if (a.length === 1 && /[A-Z]/.test(a)) { ini[iniPos] = a; if (iniPos < 2) iniPos++; else saveInitials(); }
      break;
    }
    case 'results':
      if (a === 'a') startGame(G.mode);
      else if (a === 'share') share();
      else if (a === 'back') toAttract();
      break;
    case 'tape':
      if (a === 'a') playReplay();
      else if (a === 'b' || a === 'race') raceReplay();
      else if (a === 'back') { history.replaceState(null, '', location.pathname); toAttract(); }
      break;
    case 'service': {
      const items = serviceItems();
      if (a === 'up') serviceSel = (serviceSel + items.length - 1) % items.length;
      else if (a === 'down') serviceSel = (serviceSel + 1) % items.length;
      else if (a === 'left' || a === 'right' || a === 'a') { items[serviceSel].toggle(); applyDip(); Sound.menu(); }
      else if (a === 'back') { applyDip(); toAttract(); }
      break;
    }
  }
}
function pickPerk(i) { if (phase !== 'draft' || i < 0 || i > 2) return; G.pending.push(IN.PERK0 + i); Sound.start(); acc = 0; go('play'); }
function saveInitials() {
  hiTable.splice(rankPos, 0, { i: ini.join(''), s: G.s.score, m: G.mode }); hiTable = hiTable.slice(0, 10);
  localStorage.setItem('ns3_hi', JSON.stringify(hiTable)); Sound.start(); go('results');
}
function serviceItems() {
  return [
    { label: 'COIN MODE', value: dip.freePlay ? 'FREE PLAY' : '1 COIN 1 PLAY', on: dip.freePlay, toggle: () => dip.freePlay = !dip.freePlay },
    { label: 'SOUND', value: dip.sound ? 'ON' : 'OFF', on: dip.sound, toggle: () => dip.sound = !dip.sound },
    { label: 'PALETTE', value: dip.palette === 'normal' ? 'ARCADE' : 'HIGH CONTRAST', on: dip.palette !== 'normal', toggle: () => dip.palette = dip.palette === 'normal' ? 'alt' : 'normal' },
    { label: 'MOTION', value: dip.reduced ? 'REDUCED' : 'FULL', on: dip.reduced, toggle: () => dip.reduced = !dip.reduced },
    { label: 'CPU PATH IN DEMO', value: dip.aiPath ? 'SHOW' : 'HIDE', on: dip.aiPath, toggle: () => dip.aiPath = !dip.aiPath },
    { label: 'RESET HIGH SCORES', value: 'PUSH', on: false, toggle: () => { hiTable = DEFAULT_HI.slice(); localStorage.removeItem('ns3_hi'); } },
  ];
}

// ── replays ───────────────────────────────────────────────────────────────
async function share() {
  const g = G, s = g.s;
  const str = await encode({ seed: g.meta.seed, mode: g.mode, end: s.tick, score: s.score }, g.log);
  const url = `${location.origin}${location.pathname}#r=${str}`;
  history.replaceState(null, '', '#r=' + str);
  try { await navigator.clipboard.writeText(url); toast = `LINK COPIED  ${str.length} CHR`; } catch { toast = `LINK IN ADDRESS BAR  ${str.length} CHR`; }
  toastT = 4000; Sound.coin();
}
async function loadReplay(str) {
  try {
    const { meta, log } = await decode(str);
    const fin = simulate(meta, log);
    loadedReplay = { meta, log, ok: fin.score === meta.score, real: fin.score, ticks: fin.tick, chars: str.length };
    G = null; go('tape');
  } catch (e) { console.warn(e); toAttract(); }
}
function playReplay() {
  const { meta, log } = loadedReplay;
  G = newSession(meta.mode, meta.seed); G.mode = meta.mode; G.human = false; G.cursor = new Cursor(log); G.log = log;
  if (meta.mode === 'vsai') G.ghost = { s: create(meta.seed, 'classic'), pilot: new Pilot(meta.seed), label: 'CPU' };
  replaySpeed = 1; acc = 0; go('replay');
}
function raceReplay() { const { meta, log } = loadedReplay; const wasFree = dip.freePlay; dip.freePlay = true; startGame(meta.mode === 'watch' ? 'classic' : meta.mode, meta.seed, { ghostLog: log, ghostLabel: 'TAPE' }); dip.freePlay = wasFree; }

// ── frame ─────────────────────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min(100, now - (last || now)); last = now;
  stats.frames.push(dt); if (stats.frames.length > 120) stats.frames.shift();
  pollGamepad();
  updatePhase(dt);

  const simulating = G && (phase === 'play' || phase === 'replay' || (phase === 'attract' && G.demo));
  if (simulating) {
    acc += dt * (phase === 'replay' ? replaySpeed : 1);
    let guard = 0;
    while (acc >= DT && guard++ < 40) {
      acc -= DT;
      if (G.s.dead || (G.s.draft && G.human && !G.pending.some(c => c >= IN.PERK0 && c <= IN.PERK2))) { acc = 0; break; }
      tickOnce();
      if (phase !== 'play' && phase !== 'replay' && phase !== 'attract') break;
    }
  }
  draw(now, simulating ? acc / DT : 0);
  post ? post.render(now / 1000) : null;
  if (debug) drawDebug();
  requestAnimationFrame(loop);
}

function draw(now, alpha) {
  const P = R.pal;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SW, SH);
  const ui = { freePlay: dip.freePlay, credits, modeLabel: G && !G.demo ? (G.cursor ? 'REPLAY' + (replaySpeed > 1 ? ' x' + replaySpeed : '') : UI.MODE_INFO[G.mode]?.[0]) : '' };
  const inGame = G && phase !== 'attract' && phase !== 'select' && phase !== 'service' && phase !== 'tape';
  const showsField = G && (inGame || (phase === 'attract' && G.demo) || phase === 'select' && false);

  const s = G?.s;
  R.hud({ now, s: showsField ? s : null, score: showsField && !G.demo ? s.score : 0, hi: Math.max(hiScore(), showsField && G.human ? s.score : 0),
    p1Blink: phase === 'play' && G?.human, cpu: showsField && G.ghost ? G.ghost.s.score : null, cpuLabel: G?.ghost?.label });

  if (showsField) {
    const pilot = G.pilot || G.ghost?.pilot;
    const v = { s, alpha, now, ghost: G.ghost?.s, deathT: phase === 'dying' || phase === 'continue' || phase === 'gameover' ? Math.max(0, phaseT - 300) : 0 };
    const wantViz = pilot && ((G.demo && dip.aiPath) || G.mode === 'watch' || showCycle || debug);
    if (wantViz && !s.walls.some(Boolean) && (showCycle || debug)) v.cycle = pilot.cyc;
    if (wantViz) { const src = G.pilot ? s : G.ghost.s; v.plan = pilot.plan; v.planFrom = R.segs(src, alpha)[0]; }
    if (phase === 'continue' || phase === 'gameover') v.deathT = 1e9;
    R.playfield(v);
  }

  switch (phase) {
    case 'attract': {
      const scr = ATTRACT[attractIdx];
      if (scr === 'title') UI.title(ctx, P, ui, now, phaseT);
      else if (scr === 'items') UI.items(ctx, P, ui, now, phaseT);
      else if (scr === 'scores') UI.scores(ctx, P, ui, now, hiTable);
      else if (scr === 'demo') UI.demoBanner(ctx, P, ui, now);
      break;
    }
    case 'select': UI.select(ctx, P, ui, now, selIdx, bestByMode()); break;
    case 'ready': UI.ready(ctx, P, G.mode === 'watch' ? 'CPU PLAYER' : G.ghost ? 'P1  VS  ' + G.ghost.label : 'PLAYER ONE'); break;
    case 'paused': UI.pause(ctx, P, now); break;
    case 'draft': UI.draft(ctx, P, now, s, draftSel); break;
    case 'continue': UI.cont(ctx, P, now, Math.max(0, contN), s.charges); break;
    case 'gameover': UI.gameOver(ctx, P); break;
    case 'initials': UI.initials(ctx, P, now, ini, iniPos, s.score, ['1ST', '2ND', '3RD'][rankPos] || (rankPos + 1) + 'TH'); break;
    case 'results': UI.results(ctx, P, now, result, toastT > 0 ? toast : ''); break;
    case 'tape': UI.tape(ctx, P, now, loadedReplay); break;
    case 'service': UI.service(ctx, P, now, serviceItems(), serviceSel); break;
    case 'replay': if ((now / 500 | 0) % 2) text(ctx, 'REPLAY  1/2/4 SPEED', SW / 2, 26 + 2, P.white, { align: 'c', small: true }); break;
  }
  if (phase !== 'service') UI.credit(ctx, P, ui);
}

function drawDebug() {
  const c = $('dbg-graph'), x = c.getContext('2d'), f = stats.frames;
  x.clearRect(0, 0, c.width, c.height);
  f.forEach((ms, i) => { x.fillStyle = ms > 20 ? '#ff2a2a' : '#9cff57'; const h = Math.min(c.height, ms * 2); x.fillRect(i * 2, c.height - h, 1.5, h); });
  const avg = f.reduce((a, b) => a + b, 0) / f.length, s = G?.s, pilot = G?.pilot || G?.ghost?.pilot;
  $('dbg-text').textContent = [
    `phase  ${phase}`, `fps    ${(1000 / avg).toFixed(0)} (${avg.toFixed(1)}ms)`, `step   ${stats.stepUs.toFixed(0)}us @${TPS}Hz`,
    `tick   ${s?.tick ?? '-'}  spd ${s ? speed(s) : '-'}`, `hash   ${s ? hash(s) : '-'}`, `seed   ${G?.meta.seed.toString(16) ?? '-'}`,
    `log    ${G?.log.length ?? 0} in / ${G?.snaps.length ?? 0} snap`, `ai     ${pilot ? pilot.mode + ' ' + stats.aiMs.toFixed(2) + 'ms' : 'off'}`, `gfx    ${post ? 'webgl2 crt' : 'canvas2d'}`,
  ].join('\n');
}

// ── input wiring ──────────────────────────────────────────────────────────
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'a', Space: 'a', KeyZ: 'a', KeyX: 'b', KeyR: 'b', Digit5: 'coin', KeyC: 'coin', Escape: 'back', Backspace: 'back', KeyP: 'pause', F2: 'service', Digit9: 'service' };
addEventListener('keydown', e => {
  if (e.repeat && !/Arrow/.test(e.code)) return;
  if (e.code === 'Backquote') { debug = !debug; $('debug').classList.toggle('hidden', !debug); return; }
  if (e.code === 'KeyV') { showCycle = !showCycle; return; }
  if (phase === 'initials' && /^Key[A-Z]$/.test(e.code)) { e.preventDefault(); act(e.code.slice(3)); return; }
  if (phase === 'draft' && /^Digit[123]$/.test(e.code)) return act('n' + (+e.code.slice(5) - 1));
  if (phase === 'replay' && /^Digit[124]$/.test(e.code)) { replaySpeed = +e.code.slice(5); return; }
  if (phase === 'results' && e.code === 'KeyS') return act('share');
  if (phase === 'play' && e.code === 'Space') { e.preventDefault(); return act('pause'); }
  const a = KEYMAP[e.code]; if (!a) return;
  e.preventDefault();
  act(a);
});

// cabinet controls
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); act(b.dataset.act); }));
document.querySelectorAll('[data-act]').forEach(b => ['pointerup', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('down'))));
const stick = $('stick'), ball = $('ball');
let stickDir = null;
function stickAt(e) {
  const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
  ball.style.transform = `translate(${off[0] * 12}px, ${off[1] * 12}px)`;
  if (d !== stickDir) { stickDir = d; act(d); }
}
stick.addEventListener('pointerdown', e => { e.preventDefault(); stick.setPointerCapture(e.pointerId); stickAt(e); });
stick.addEventListener('pointermove', e => { if (stickDir) stickAt(e); });
['pointerup', 'pointercancel'].forEach(ev => stick.addEventListener(ev, () => { stickDir = null; ball.style.transform = ''; }));
addEventListener('keydown', e => { const off = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code]; if (off) { ball.style.transform = `translate(${off[0] * 12}px, ${off[1] * 12}px)`; clearTimeout(ball._t); ball._t = setTimeout(() => ball.style.transform = '', 140); } });

let touch = null;
screenEl.addEventListener('touchstart', e => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
screenEl.addEventListener('touchmove', e => {
  if (!touch) return; const dx = e.touches[0].clientX - touch.x, dy = e.touches[0].clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; e.preventDefault();
}, { passive: false });
screenEl.addEventListener('touchend', e => { if (touch && phase !== 'play') act('a'); touch = null; });

let pad = {};
function pollGamepad() {
  const p = navigator.getGamepads?.()[0]; if (!p) return;
  const b = i => p.buttons[i]?.pressed, ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  const now = { up: b(12) || ay < -.6, down: b(13) || ay > .6, left: b(14) || ax < -.6, right: b(15) || ax > .6, a: b(0), b: b(1), pause: b(9), coin: b(8) };
  for (const k in now) if (now[k] && !pad[k]) act(k);
  pad = now;
}
function rumble(ms, m) { navigator.getGamepads?.()[0]?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: m, weakMagnitude: m }).catch(() => {}); }

addEventListener('blur', () => { if (phase === 'play' && G?.human) go('paused'); });

resize(); applyDip();
if (location.hash.startsWith('#r=')) loadReplay(location.hash.slice(3));
requestAnimationFrame(loop);
window.__ns = { get G() { return G; }, get phase() { return phase; }, act };   // debug/test hook
