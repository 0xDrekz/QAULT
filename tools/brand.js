// Renders the QAULT logo files in brand/ — run: node tools/brand.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const F = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const OUT = path.join(__dirname, "..", "brand");
const GREEN = "#1f5140", PAPER = "#f5f2ec", BRASS = "#d2b072", INK = "#17191c", BRASS_D = "#a8823f";
const mark = (s, ring, dot, handle) => `
  <circle cx="${15*s}" cy="${15*s}" r="${8.5*s}" fill="none" stroke="${ring}" stroke-width="${1.8*s}"/>
  <path d="M${18.6*s} ${18.6*s}l${5.4*s} ${5.4*s}" stroke="${handle}" stroke-width="${1.8*s}" stroke-linecap="round"/>
  <circle cx="${15*s}" cy="${15*s}" r="${2.2*s}" fill="${dot}"/>`;
const save = (name, svg, w) => {
  fs.writeFileSync(path.join(OUT, name + ".svg"), svg);
  fs.writeFileSync(path.join(OUT, name + ".png"), new Resvg(svg, { font: { fontFiles: F, loadSystemFonts: false }, fitTo: { mode: "width", value: w } }).render().asPng());
};
// 1. app/profile icon: green tile
save("qault-icon", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${GREEN}"/>${mark(1, PAPER, PAPER, BRASS)}</svg>`, 1024);
// 2. round profile picture (X crops to a circle)
save("qault-avatar", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${GREEN}"/><g transform="translate(1.4 1.4)">${mark(1, PAPER, PAPER, BRASS)}</g></svg>`, 800);
// 3. mark on its own: green on paper, and paper on dark
save("qault-mark-light", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${PAPER}"/>${mark(1, GREEN, GREEN, BRASS_D)}</svg>`, 1024);
save("qault-mark-dark", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#121312"/>${mark(1, "#8cc4ab", "#8cc4ab", BRASS)}</svg>`, 1024);
// 4. wordmark
const word = (bg, ring, text, handle) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 160"><rect width="496" height="160" fill="${bg}"/>
  <g transform="translate(56 34) scale(3)">${mark(1, ring, ring, handle)}</g>
  <text x="168" y="101" font-family="Inter" font-weight="600" font-size="58" letter-spacing="18" fill="${text}">QAULT</text></svg>`;
save("qault-wordmark-light", word(PAPER, GREEN, INK, BRASS_D), 1240);
save("qault-wordmark-dark", word("#121312", "#8cc4ab", "#ecebe6", BRASS), 1240);
// 5. X / Twitter banner 1500x500
let chains = "", seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 30; i++) {
  const ph = r() * 6.28, amp = 0.4 + r() * 0.9, fr = 1.2 + r() * 1.6, sig = 3 + Math.floor(r() * 10), pts = [];
  for (let k = 0; k < 16; k++) { const u = k / 15; pts.push([1010 + i * 15 + Math.sin(u * fr * Math.PI + ph) * amp * 22, 70 + u * 340]); }
  chains += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="1.1"/>`;
  chains += `<circle cx="${pts[sig][0].toFixed(1)}" cy="${pts[sig][1].toFixed(1)}" r="4.5" fill="none" stroke="${GREEN}" stroke-width="1.5"/>`;
  const w = pts[Math.min(14, sig + 3)]; chains += `<circle cx="${w[0].toFixed(1)}" cy="${w[1].toFixed(1)}" r="3" fill="${BRASS_D}"/>`;
  chains += `<rect x="${(pts[15][0]-3.5).toFixed(1)}" y="${(pts[15][1]-3.5).toFixed(1)}" width="7" height="7" fill="${GREEN}"/>`;
}
save("qault-x-banner", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500"><rect width="1500" height="500" fill="${PAPER}"/>${chains}
  <text x="120" y="190" font-family="Instrument Serif" font-size="96" fill="${INK}">The quantum <tspan font-style="italic" fill="${GREEN}">vault.</tspan></text>
  <text x="124" y="252" font-family="Inter" font-weight="500" font-size="30" fill="#3a3e44">Is your Solana wallet ready for Q-Day?</text>
  <text x="124" y="304" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${GREEN}">qault.xyz</text></svg>`, 1500);
console.log(fs.readdirSync(OUT).join("\n"));
