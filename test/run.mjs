// Headless test suite — runs the real engine + AI in Node, no browser.
//   node test/run.mjs
import { create, step, hash, N, IN } from '../src/engine.js';
import { Pilot, buildCycle } from '../src/ai.js';
import { encode, decode, simulate } from '../src/replay.js';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

globalThis.performance ??= { now: () => Date.now() };
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); };

function botRun(seed, mode, maxTicks) {
  let s = create(seed, mode); const ai = new Pilot(seed), log = [];
  while (!s.dead && s.tick < maxTicks) {
    const code = ai.decide(s), ins = code >= 0 ? [code] : [];
    for (const c of ins) log.push([s.tick, c]);
    s = step(s, ins);
  }
  return { s, log };
}

console.log('\nHamiltonian cycles');
for (const seed of [1, 2, 3, 42, 1337]) {
  const { next } = buildCycle(seed); const seen = new Set(); let c = 0, adj = true;
  for (let i = 0; i < N; i++) { seen.add(c); const n = next[c]; if (Math.abs(n % 22 - c % 22) + Math.abs(((n / 22) | 0) - ((c / 22) | 0)) !== 1) adj = false; c = n; }
  ok(seen.size === N && c === 0 && adj, `seed ${seed}: visits all ${N} cells, adjacent steps, closes`);
}

console.log('\nDeterminism');
for (const [seed, mode] of [[7, 'classic'], [99, 'portal'], [12345, 'maze']]) {
  const a = botRun(seed, mode, 6000), b = botRun(seed, mode, 6000);
  ok(hash(a.s) === hash(b.s), `${mode} seed ${seed}: two runs → identical hash ${hash(a.s)} (score ${a.s.score}, tick ${a.s.tick})`);
  const re = simulate({ seed, mode, end: a.s.tick }, a.log);
  ok(hash(re) === hash(a.s), `${mode}: re-simulating the ${a.log.length}-input log reproduces the run`);
}

console.log('\nReplay codec');
{
  const { s, log } = botRun(2026, 'classic', 4000);
  const meta = { seed: 2026, mode: 'daily', end: s.tick, score: s.score };
  const str = await encode(meta, log);
  const back = await decode(str);
  ok(JSON.stringify(back.log) === JSON.stringify(log) && back.meta.score === s.score, `roundtrip ${log.length} inputs → ${str.length} URL chars`);
  const forged = { ...back.meta, score: back.meta.score + 500 };
  const v = simulate(forged, back.log);
  ok(v.score !== forged.score, `forged score (${forged.score}) rejected by re-sim (${v.score})`);
}

console.log('\nAI quality (open board, cycle + shortcuts)');
{
  let deaths = 0, total = 0, fills = [];
  for (let seed = 1; seed <= 6; seed++) {
    const { s } = botRun(seed, 'classic', 30000);
    total++; if (s.dead) deaths++; fills.push(s.eaten);
  }
  ok(deaths === 0, `6 classic runs × 30k ticks: ${deaths} deaths, berries eaten ${fills.join(' ')}`);
  const m = botRun(5, 'maze', 8000).s;
  console.log(`  · maze (A* + tail check) sample: score ${m.score}, length ${m.snake.length}, ${m.dead ? 'died' : 'alive'} at tick ${m.tick}`);
}

console.log('\nPerf');
{
  let s = create(1, 'classic'); const t = Date.now(); for (let i = 0; i < 20000; i++) s = step(s, s.draft ? [IN.PERK0] : []);
  console.log(`  · 20k bare steps: ${Date.now() - t} ms`);
}

console.log('\nSize budget');
{
  let raw = 0, gz = 0, all = []; const files = ['index.html', 'style.css', ...readdirSync('src').map(f => 'src/' + f)];
  for (const f of files) { const b = readFileSync(f); raw += b.length; all.push(b); }
  gz = gzipSync(Buffer.concat(all), { level: 9 }).length;
  ok(gz < 32 * 1024, `${files.length} files, ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped as one bundle, 0 dependencies`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
