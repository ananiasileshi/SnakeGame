// Hand-drawn 5×7 bitmap font. Each glyph = 7 rows of 5 bits (MSB = left).
const G = {
  A:'0e11111f111111',B:'1e11111e11111e',C:'0e11101010110e',D:'1e11111111111e',E:'1f10101e10101f',F:'1f10101e101010',
  G:'0e11101711110f',H:'1111111f111111',I:'0e04040404040e',J:'0702020202120c',K:'11121418141211',L:'1010101010101f',
  M:'111b1515111111',N:'11111915131111',O:'0e11111111110e',P:'1e11111e101010',Q:'0e11111115120d',R:'1e11111e141211',
  S:'0f10100e01011e',T:'1f040404040404',U:'1111111111110e',V:'11111111110a04',W:'1111111515150a',X:'11110a040a1111',
  Y:'11110a04040404',Z:'1f01020408101f',
  0:'0e11131519110e',1:'040c040404040e',2:'0e11010204081f',3:'1f02040201110e',4:'02060a121f0202',5:'1f101e0101110e',
  6:'0608101e11110e',7:'1f010204080808',8:'0e11110e11110e',9:'0e11110f01020c',
  ' ':'00000000000000','.':'00000000000c0c',',':'000000000c0408','!':'04040404040004','?':'0e110102040004',
  '-':'0000001f000000',':':'000c0c000c0c00','/':'01010204081010',"'":'04040800000000','(':'02040808080402',
  ')':'08040202020408','>':'08040201020408','<':'02040810080402','x':'0000110a040a11','+':'0004041f040400',
  '=':'00001f001f0000','}':'080c0e0f0e0c08','{':'02060e1e0e0602','*':'00150e1f0e1500','#':'0a0a1f0a1f0a0a',
  '%':'18190204081303','_':'0000000000001f','"':'0a0a0000000000','^':'040e1f00000000','&':'0c12140815120d','v':'0000001f0e0400',
};
const ROWS = {};
for (const k in G) { const h = G[k]; ROWS[k] = []; for (let i = 0; i < 7; i++) ROWS[k].push(parseInt(h.substr(i * 2, 2), 16)); }

// draw text; advance = 8px (tile grid) or 6px (small). align: 'l' | 'c' | 'r'
export function text(ctx, str, x, y, color, opt = {}) {
  const s = opt.scale || 1, adv = (opt.small ? 6 : 8) * s;
  str = String(str).toUpperCase().replace(/×/g, 'x');
  if (opt.align === 'c') x -= (str.length * adv - (adv - 5 * s)) / 2;
  else if (opt.align === 'r') x -= str.length * adv - (adv - 5 * s);
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const g = ROWS[str[i]] || ROWS['?'];
    for (let r = 0; r < 7; r++) { const row = g[r]; if (!row) continue;
      for (let c = 0; c < 5; c++) if (row & (16 >> c)) ctx.fillRect(x + i * adv + c * s, y + r * s, s, s); }
  }
}
export const textWidth = (str, opt = {}) => String(str).length * (opt.small ? 6 : 8) * (opt.scale || 1);
