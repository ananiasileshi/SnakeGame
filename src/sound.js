// Procedural SFX via Web Audio — no audio files.
export const Sound = {
  ctx: null, muted: false,
  init() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} if (this.ctx?.state === 'suspended') this.ctx.resume(); },
  tone(f, d = .1, type = 'square', v = .07, slide = null, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d + .02);
  },
  eat(c) { const b = 440 * 2 ** ((c - 1) / 6); this.tone(b, .08, 'square', .05); this.tone(b * 1.5, .1, 'triangle', .06, null, .05); },
  golden() { [0, 4, 7, 12].forEach((s, i) => this.tone(660 * 2 ** (s / 12), .12, 'triangle', .06, null, i * .05)); },
  power() { this.tone(300, .3, 'sawtooth', .04, 1200); this.tone(600, .3, 'sine', .05, 2400, .05); },
  rewind() { this.tone(1600, .45, 'sawtooth', .05, 120); this.tone(800, .45, 'sine', .05, 60, .05); },
  turn() { this.tone(180, .03, 'square', .012); },
  level() { [0, 3, 7, 10, 12].forEach((s, i) => this.tone(520 * 2 ** (s / 12), .14, 'square', .04, null, i * .07)); },
  die() { for (let i = 0; i < 8; i++) this.tone(700 - i * 70, .09, 'square', .06, 500 - i * 60, i * .1); this.tone(110, .4, 'triangle', .08, 40, .85); },
  coin() { this.tone(988, .07, 'square', .06); this.tone(1319, .25, 'square', .06, null, .07); },
  menu() { this.tone(660, .04, 'square', .04); },
  start() { [[523,0],[659,.1],[784,.2],[1047,.3],[784,.42],[1047,.5]].forEach(([f,d]) => this.tone(f, .1, 'square', .05, null, d)); },
  count(n) { this.tone(n ? 440 : 880, n ? .12 : .3, 'square', .05); },
};
