// OKLCH → WCAG contrast calculator for the NLU Stock audit.
// ponytail: self-contained, no deps. Verify contrast claims instead of guessing.
function oklchToLinear(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541726 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
function lum([r, g, b]) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function hexToLinear(hex) {
  const n = hex.replace("#", "");
  const v = n.length === 3 ? n.split("").map((c) => c + c) : n.match(/.{2}/g);
  const [r, g, b] = v.map((x) => parseInt(x, 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(r), lin(g), lin(b)];
}
// composite fg oklch over bg linear (alpha tint over white/etc)
function tintOver(fgLin, bgLin, a) { return fgLin.map((c, i) => c * a + bgLin[i] * (1 - a)); }
function contrast(L1, L2) { return ((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)); }
function rate(r) { return r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA-large" : "FAIL"; }

const WHITE = hexToLinear("#ffffff");
const PAGE = oklchToLinear(0.97, 0.003, 264);
const ACCENT = oklchToLinear(0.94, 0.04, 40);
const CARD_DARK = oklchToLinear(0.28, 0.005, 264);
const ORANGE100 = oklchToLinear(0.95, 0.03, 58); // ~Tailwind default orange-100 (token undefined)
const ORANGE900 = oklchToLinear(0.28, 0.09, 40); // project orange-900

const pairs = [
  // [name, fgLum, bgLum, AA target notes]
  ["muted-fg on white (body secondary)", lum(oklchToLinear(0.43, 0.006, 264)), lum(WHITE)],
  ["muted-fg on page bg", lum(oklchToLinear(0.43, 0.006, 264)), lum(PAGE)],
  ["muted-fg on accent warm (sidebar hover text area)", lum(oklchToLinear(0.43, 0.006, 264)), lum(ACCENT)],
  ["ink on white", lum(oklchToLinear(0.20, 0.003, 264)), lum(WHITE)],
  ["white on primary orange", lum(WHITE), lum(oklchToLinear(0.62, 0.19, 40))],
  ["warning-fg on warning", lum(oklchToLinear(0.25, 0.05, 75)), lum(oklchToLinear(0.72, 0.16, 75))],
  ["white on success teal", lum(WHITE), lum(oklchToLinear(0.60, 0.13, 185))],
  ["white on danger red", lum(WHITE), lum(oklchToLinear(0.55, 0.20, 25))],
  ["danger text on white (badge/btn)", lum(oklchToLinear(0.55, 0.20, 25)), lum(WHITE)],
  ["danger text on danger/10 tint", lum(oklchToLinear(0.55, 0.20, 25)), lum(tintOver(oklchToLinear(0.55, 0.20, 25), WHITE, 0.10))],
  ["orange-500 text on orange-100 (sidebar inactive icon)", lum(oklchToLinear(0.62, 0.19, 40)), lum(ORANGE100)],
  ["orange-700 text on orange-50", lum(oklchToLinear(0.55, 0.18, 40)), lum(oklchToLinear(0.94, 0.04, 40))],
  ["info-500 on info/10 tint", lum(oklchToLinear(0.58, 0.12, 240)), lum(tintOver(oklchToLinear(0.58, 0.12, 240), WHITE, 0.10))],
  ["warning-500 on warning/10 tint", lum(oklchToLinear(0.72, 0.16, 75)), lum(tintOver(oklchToLinear(0.72, 0.16, 75), WHITE, 0.10))],
  ["chart-5 neutral on white", lum(oklchToLinear(0.65, 0.003, 264)), lum(WHITE)],
  ["white on orange-900 (logo tile bg?)", lum(WHITE), lum(ORANGE900)],
  // dark mode
  ["DARK muted-fg on card", lum(oklchToLinear(0.72, 0.006, 264)), lum(CARD_DARK)],
  ["DARK ink(92%) on card", lum(oklchToLinear(0.92, 0.003, 264)), lum(CARD_DARK)],
  ["DARK orange-400 icon on orange-900/30 tint", lum(oklchToLinear(0.72, 0.16, 40)), lum(tintOver(ORANGE900, CARD_DARK, 0.30))],
];

console.log(`${"pair".padEnd(58)} ${"ratio".padStart(6)}  verdict`);
console.log("-".repeat(80));
for (const [name, fg, bg] of pairs) {
  const r = contrast(fg, bg);
  console.log(`${name.padEnd(58)} ${r.toFixed(2).padStart(6)}  ${rate(r)}`);
}

console.log("\n=== CANDIDATE SWEEP (pick lightest that passes) ===");
console.log("\n-- white on orange (primary) [fg=white, bg=orange] --");
for (const L of [0.62, 0.6, 0.58, 0.56, 0.55, 0.54, 0.52, 0.5]) {
  const r = contrast(lum(WHITE), lum(oklchToLinear(L, 0.19, 40)));
  console.log(`  primary L=${(L*100).toFixed(0)}%  white-on-it=${r.toFixed(2)}  ${r>=4.5?"AA✓":r>=3?"lg":"fail"}`);
}
const W15 = tintOver(oklchToLinear(0.72,0.16,75), WHITE, 0.15);
const S15 = tintOver(oklchToLinear(0.60,0.13,185), WHITE, 0.15);
const D15 = tintOver(oklchToLinear(0.55,0.20,25), WHITE, 0.15);
const O15 = tintOver(oklchToLinear(0.62,0.19,40), WHITE, 0.15);
console.log("\n-- dark fg on /15 tint (status badges) --");
for (const [name, hue, tint] of [["warning/15",75,W15],["success/15",185,S15],["danger/15",25,D15],["orange/15",40,O15]]) {
  process.stdout.write(`  ${name.padEnd(12)}`);
  for (const L of [0.5,0.45,0.4,0.35,0.3,0.25]) {
    const chroma = hue===40?0.14:hue===25?0.16:hue===75?0.15:0.10;
    const r = contrast(lum(oklchToLinear(L,chroma,hue)), lum(tint));
    process.stdout.write(` L${(L*100).toFixed(0)}=${r.toFixed(1)}${r>=4.5?"✓":""} `);
  }
  console.log("");
}
