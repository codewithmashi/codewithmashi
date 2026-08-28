/**
 * Generates assets/hero-<theme>.svg — a genuine 3D wireframe icosphere, rotated and
 * perspective-projected in Node, then baked into SMIL keyframes so it animates inside
 * a GitHub README (which strips <script> but honours declarative SVG animation).
 *
 *   node scripts/build-hero.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1200, H = 400, FRAMES = 40, DUR = 22; // seconds per full loop
const CX = W / 2, CY = H / 2;

/* ── icosahedron ─────────────────────────────────────────────────────────── */
const t = (1 + Math.sqrt(5)) / 2;
let V = [
  [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
  [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
  [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
];
const norm = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
V = V.map(norm);

const FACES = [
  [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
];
// subdivide once for a denser, prettier cage
const mid = new Map();
const midpoint = (a, b) => {
  const k = a < b ? `${a}_${b}` : `${b}_${a}`;
  if (mid.has(k)) return mid.get(k);
  const m = norm([(V[a][0]+V[b][0])/2, (V[a][1]+V[b][1])/2, (V[a][2]+V[b][2])/2]);
  V.push(m); mid.set(k, V.length - 1); return V.length - 1;
};
// Base icosahedron only. Subdividing once gives 120 edges, which bakes into a
// ~570 KB SVG — too heavy to sit at the top of a README. 30 edges reads just as
// clean at banner size and lands under 50 KB.
const F2 = FACES;
void midpoint;
const edgeSet = new Set();
for (const f of F2) for (let i=0;i<3;i++) {
  const a = f[i], b = f[(i+1)%3];
  edgeSet.add(a < b ? `${a},${b}` : `${b},${a}`);
}
const EDGES = [...edgeSet].map(s => s.split(',').map(Number));

/* ── projection ──────────────────────────────────────────────────────────── */
const R = 150, CAM = 4.2, FOV = 430;
function project(v, ay, ax) {
  let [x,y,z] = v;
  // rotate Y then X
  let x1 =  x*Math.cos(ay) + z*Math.sin(ay);
  let z1 = -x*Math.sin(ay) + z*Math.cos(ay);
  let y1 =  y*Math.cos(ax) - z1*Math.sin(ax);
  let z2 =  y*Math.sin(ax) + z1*Math.cos(ax);
  const d = CAM - z2 * 1.0;                 // perspective divide
  const k = FOV / (d * R / R);
  return { x: CX + (x1 * R * k) / FOV * 2.6, y: CY + (y1 * R * k) / FOV * 2.6, z: z2 };
}
const r2 = n => Math.round(n * 10) / 10;
const ri = n => Math.round(n);

/* ── per-frame geometry ──────────────────────────────────────────────────── */
const frames = [];
for (let f = 0; f < FRAMES; f++) {
  const p = f / FRAMES;
  const ay = p * Math.PI * 2;                    // full turn -> seamless loop
  const ax = Math.sin(p * Math.PI * 2) * 0.32;   // gentle nod, also loops
  frames.push(V.map(v => project(v, ay, ax)));
}
const vals = fn => frames.map(fn).join(';') + ';' + fn(frames[0]);

/* ── deterministic starfield ─────────────────────────────────────────────── */
let s = 987654321;
const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const STARS = Array.from({ length: 150 }, () => ({
  x: r2(rnd() * W), y: r2(rnd() * H),
  r: r2(0.5 + rnd() * 1.5), o: r2(0.12 + rnd() * 0.5),
  d: r2(rnd() * 6), dur: r2(3 + rnd() * 5),
}));

/* ── emit ────────────────────────────────────────────────────────────────── */
function build({ bg, dim, edge, vert, name, role, meta, accentA, accentB }) {
  const stars = STARS.map(t =>
    `<circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="${dim}" opacity="${t.o}">` +
    `<animate attributeName="opacity" values="${t.o};${r2(t.o*0.25)};${t.o}" ` +
    `dur="${t.dur}s" begin="-${t.d}s" repeatCount="indefinite"/></circle>`
  ).join('');

  const lines = EDGES.map(([a, b]) => {
    const x1 = vals(fr => ri(fr[a].x)), y1 = vals(fr => ri(fr[a].y));
    const x2 = vals(fr => ri(fr[b].x)), y2 = vals(fr => ri(fr[b].y));
    // depth -> opacity, so the far side of the cage recedes
    const op = vals(fr => r2(0.12 + 0.55 * ((fr[a].z + fr[b].z) / 2 + 1) / 2));
    const A = (n, v) => `<animate attributeName="${n}" values="${v}" dur="${DUR}s" repeatCount="indefinite"/>`;
    // Static frame-0 values: SMIL drives these, but a rasteriser that ignores <animate>
    // would otherwise draw nothing at all.
    const f0 = frames[0];
    return `<line stroke="${edge}" stroke-width="1.15" x1="${ri(f0[a].x)}" y1="${ri(f0[a].y)}" x2="${ri(f0[b].x)}" y2="${ri(f0[b].y)}" opacity="${r2(0.12 + 0.55*((f0[a].z+f0[b].z)/2+1)/2)}">${A('x1',x1)}${A('y1',y1)}${A('x2',x2)}${A('y2',y2)}${A('opacity',op)}</line>`;
  }).join('');

  const dots = V.map((_, i) => {
    const cx = vals(fr => ri(fr[i].x)), cy = vals(fr => ri(fr[i].y));
    const op = vals(fr => r2(0.15 + 0.75 * (fr[i].z + 1) / 2));
    const rr = vals(fr => r2(1.6 + 2.2 * (fr[i].z + 1) / 2));
    const A = (n, v) => `<animate attributeName="${n}" values="${v}" dur="${DUR}s" repeatCount="indefinite"/>`;
    const f0 = frames[0];
    return `<circle fill="url(#g)" cx="${ri(f0[i].x)}" cy="${ri(f0[i].y)}" r="${r2(1.6 + 2.2*(f0[i].z+1)/2)}" opacity="${r2(0.15 + 0.75*(f0[i].z+1)/2)}">${A('cx',cx)}${A('cy',cy)}${A('r',rr)}${A('opacity',op)}</circle>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${name} — ${role}">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${accentA}"/><stop offset="100%" stop-color="${accentB}"/>
  </linearGradient>
  <linearGradient id="txt" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${accentA}"/>
    <stop offset="100%" stop-color="${accentB}"/>
  </linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${accentA}" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="${accentA}" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.4"/>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="${bg}"/>
${stars}
<ellipse cx="${CX}" cy="${CY}" rx="250" ry="200" fill="url(#halo)"/>
<g>${lines}</g>
<g>${dots}</g>
<text x="60" y="${H/2 - 14}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="13" letter-spacing="4.5" fill="${dim}">${meta}</text>
<text x="58" y="${H/2 + 46}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="60" font-weight="700" letter-spacing="-1.5" fill="url(#txt)">${name}</text>
<text x="61" y="${H/2 + 78}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="14.5" letter-spacing="0.4" fill="${dim}">${role}</text>
</svg>`;
}

mkdirSync('assets', { recursive: true });

writeFileSync('assets/hero-dark.svg', build({
  bg:'#05060a', dim:'#7d87a4', edge:'#5eead4', vert:'#22d3ee',
  accentA:'#22d3ee', accentB:'#a78bfa',
  meta:'DUBAI, UAE', name:'Mohd Aadil',
  role:'Mobile &amp; AI-automation engineer',
}));

writeFileSync('assets/hero-light.svg', build({
  bg:'#ffffff', dim:'#5b6478', edge:'#0891b2', vert:'#7c3aed',
  accentA:'#0891b2', accentB:'#7c3aed',
  meta:'DUBAI, UAE', name:'Mohd Aadil',
  role:'Mobile &amp; AI-automation engineer',
}));

console.log(`verts=${V.length} edges=${EDGES.length} frames=${FRAMES}`);
