// Replays: an input log [[tick, code], ...] → varint bytes → deflate-raw → base64url.
// A whole run is usually a few hundred bytes and fits in a URL hash.
import { create, step, MODES } from './engine.js';

export function simulate(meta, log, onState) {
  // meta: { seed, mode, end } ; log sorted by tick
  let s = create(meta.seed, meta.mode === 'daily' || meta.mode === 'vsai' ? 'classic' : meta.mode), i = 0;
  while (!s.dead && s.tick < meta.end) {
    const ins = [];
    while (i < log.length && log[i][0] === s.tick) ins.push(log[i++][1]);
    s = step(s, ins);
    if (onState) onState(s);
    if (s.draft && i >= log.length) break;          // incomplete log: stop instead of freezing
  }
  return s;
}

export class Cursor {                               // stream a log tick by tick (ghosts, playback)
  constructor(log) { this.log = log; this.i = 0; }
  at(tick) { const out = []; while (this.i < this.log.length && this.log[this.i][0] <= tick) { if (this.log[this.i][0] === tick) out.push(this.log[this.i][1]); this.i++; } return out; }
}

function varint(arr, v) { while (v > 127) { arr.push((v & 127) | 128); v >>>= 7; } arr.push(v); }
function readVar(b, p) { let v = 0, sh = 0, x; do { x = b[p.i++]; v |= (x & 127) << sh; sh += 7; } while (x & 128); return v >>> 0; }

export function pack(meta, log) {
  const out = [1, MODES.indexOf(meta.mode)];
  varint(out, meta.seed); varint(out, meta.end); varint(out, meta.score); varint(out, log.length);
  let last = 0;
  for (const [t, c] of log) { varint(out, t - last); out.push(c); last = t; }
  return new Uint8Array(out);
}
export function unpack(bytes) {
  const p = { i: 2 };
  if (bytes[0] !== 1) throw new Error('bad replay version');
  const meta = { mode: MODES[bytes[1]], seed: readVar(bytes, p), end: readVar(bytes, p), score: readVar(bytes, p) };
  const n = readVar(bytes, p), log = [];
  let t = 0;
  for (let k = 0; k < n; k++) { t += readVar(bytes, p); log.push([t, bytes[p.i++]]); }
  return { meta, log };
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
const b64u = b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function encode(meta, log) {
  const raw = pack(meta, log);
  const z = typeof CompressionStream !== 'undefined' ? await pipe(raw, new CompressionStream('deflate-raw')) : null;
  return z && z.length < raw.length ? 'z' + b64u(z) : 'r' + b64u(raw);
}
export async function decode(str) {
  const kind = str[0], b = unb64u(str.slice(1));
  return unpack(kind === 'z' ? await pipe(b, new DecompressionStream('deflate-raw')) : b);
}
