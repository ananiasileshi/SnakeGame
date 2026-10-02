// WebGL2 post-process: real bloom (threshold → separable blur at half-res),
// barrel curvature, chromatic aberration, scanlines, vignette.
// Fallback ladder: WebGL2 → plain Canvas 2D (just show the source canvas).
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p*.5+.5; gl_Position = vec4(p,0,1); }`;
const BLUR = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o;
uniform sampler2D t; uniform vec2 dir; uniform float thresh;
vec3 pick(vec2 u){ vec3 c = texture(t,u).rgb; float l = max(c.r,max(c.g,c.b)); return c*smoothstep(thresh, thresh+.35, l); }
void main(){
  float w[5] = float[](.227,.194,.121,.054,.016); vec3 s = pick(uv)*w[0];
  for(int i=1;i<5;i++){ vec2 d = dir*float(i)*1.6; s += (pick(uv+d)+pick(uv-d))*w[i]; }
  o = vec4(s,1);
}`;
const COMP = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o;
uniform sampler2D scene, bloom; uniform float curve, ca, time, res, bloomAmt, flicker;
vec2 barrel(vec2 u){ u = u*2.-1.; u *= 1. + curve*dot(u,u); return u*.5+.5; }
void main(){
  vec2 u = barrel(uv);
  if(u.x<0.||u.y<0.||u.x>1.||u.y>1.){ o = vec4(0,0,0,1); return; }
  vec2 off = (u-.5)*ca;
  vec3 c = vec3(texture(scene,u+off).r, texture(scene,u).g, texture(scene,u-off).b);
  c += texture(bloom,u).rgb*bloomAmt;
  float sl = sin(u.y*res*3.14159*2.); c *= .72 + .28*sl*sl;            // one scanline per source row
  float mask = mod(gl_FragCoord.x, 3.); c *= mask < 1. ? vec3(1.06,.96,.96) : mask < 2. ? vec3(.96,1.06,.96) : vec3(.96,.96,1.06); // aperture grille
  vec2 v = u*(1.-u); c *= pow(v.x*v.y*16., .18);             // vignette
  c *= 1. - flicker*.02*sin(time*55.);
  o = vec4(c,1);
}`;

export function createPost(out, src) {
  const gl = out.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; };
  const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p; };
  let blur, comp;
  try { blur = prog(BLUR); comp = prog(COMP); } catch (e) { console.warn('post-fx disabled:', e); return null; }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const sceneT = tex(); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbos = [0, 1].map(() => { const t = tex(), f = gl.createFramebuffer(); return { t, f }; });
  let hw = 0, hh = 0;
  const U = (p, n) => gl.getUniformLocation(p, n);
  const opts = { curve: .06, ca: .0012, bloom: .9, flicker: 1 };

  function size(w, h) {
    out.width = w; out.height = h; hw = w >> 1; hh = h >> 1;
    for (const b of fbos) { gl.bindTexture(gl.TEXTURE_2D, b.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, hw, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.t, 0); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function render(time) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.useProgram(blur); gl.uniform1i(U(blur, 't'), 0); gl.viewport(0, 0, hw, hh);
    // horizontal (with threshold)
    gl.uniform1f(U(blur, 'thresh'), .45); gl.uniform2f(U(blur, 'dir'), 1 / hw, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0].f); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // vertical (no threshold)
    gl.bindTexture(gl.TEXTURE_2D, fbos[0].t); gl.uniform1f(U(blur, 'thresh'), -1.); gl.uniform2f(U(blur, 'dir'), 0, 1 / hh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1].f); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, out.width, out.height);
    gl.useProgram(comp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT); gl.uniform1i(U(comp, 'scene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbos[1].t); gl.uniform1i(U(comp, 'bloom'), 1);
    gl.uniform1f(U(comp, 'curve'), opts.curve); gl.uniform1f(U(comp, 'ca'), opts.ca); gl.uniform1f(U(comp, 'bloomAmt'), opts.bloom);
    gl.uniform1f(U(comp, 'time'), time); gl.uniform1f(U(comp, 'res'), src.height); gl.uniform1f(U(comp, 'flicker'), opts.flicker);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return { size, render, opts, name: 'WebGL2' };
}
