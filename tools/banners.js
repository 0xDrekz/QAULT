// Banner concepts for X (1500x500), black on white — run: node tools/banners.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const OUT = path.join(__dirname, "..", "brand", "banner-concepts");
const B = "#000", W = "#fff", G = "#8a8a8a";
const save = (name, body, bg = W) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500"><rect width="1500" height="500" fill="${bg}"/>${body}</svg>`;
  fs.writeFileSync(path.join(OUT, name + ".svg"), svg);
  fs.writeFileSync(path.join(OUT, name + ".png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
};
const mark = (x, y, s, c, sw = 1.8) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${c}" stroke-width="${sw}"/><path d="M18.6 18.6l5.4 5.4" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${c}"/></g>`;
let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const chains = (x0, w, y0, h, n, c, op = 0.55) => { let s = ""; for (let i = 0; i < n; i++) { const ph = r() * 6.28, amp = 0.4 + r() * 0.9, fr = 1.2 + r() * 1.6, sig = 3 + Math.floor(r() * 10), pts = []; for (let k = 0; k < 16; k++) { const u = k / 15; pts.push([x0 + (i / (n - 1)) * w + Math.sin(u * fr * Math.PI + ph) * amp * (w / n) * 1.3, y0 + u * h]); } s += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${c}" stroke-opacity="${op}" stroke-width="1.1"/>`; s += `<circle cx="${pts[sig][0].toFixed(1)}" cy="${pts[sig][1].toFixed(1)}" r="4.5" fill="none" stroke="${c}" stroke-width="1.5"/>`; s += `<rect x="${(pts[15][0] - 3.5).toFixed(1)}" y="${(pts[15][1] - 3.5).toFixed(1)}" width="7" height="7" fill="${c}"/>`; } return s; };

// A — Giant mark: the Q bleeding off the right edge, one line of type
save("A-giant-mark", `${mark(980, -120, 26, B, 1.6)}
  <text x="110" y="215" font-family="Instrument Serif" font-size="104" fill="${B}">The quantum vault.</text>
  <text x="114" y="275" font-family="Inter" font-weight="500" font-size="28" fill="${G}">Quantum-resistant storage for Solana · qault.xyz</text>`);

// B — The question: Q-Day as an unknown date
save("B-qday-unknown", `
  <text x="750" y="150" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="26" letter-spacing="8" fill="${G}">Q-DAY</text>
  <text x="750" y="280" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="120" letter-spacing="10" fill="${B}">??.??.20??</text>
  <text x="750" y="350" text-anchor="middle" font-family="Instrument Serif" font-style="italic" font-size="46" fill="${B}">Nobody knows when. Be ready anyway.</text>
  ${mark(1380, 410, 2.2, B)}<text x="1372" y="450" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" fill="${B}">qault.xyz</text>`);

// C — The lock: public key vs one-time key, a two-column statement
save("C-the-lock", `
  <line x1="750" y1="90" x2="750" y2="410" stroke="${B}" stroke-width="1"/>
  <text x="690" y="200" text-anchor="end" font-family="Instrument Serif" font-size="64" fill="${G}">Your wallet's lock</text>
  <text x="690" y="270" text-anchor="end" font-family="Instrument Serif" font-size="64" fill="${G}">is public.</text>
  <text x="810" y="200" font-family="Instrument Serif" font-size="64" fill="${B}">Ours changes</text>
  <text x="810" y="270" font-family="Instrument Serif" font-style="italic" font-size="64" fill="${B}">every time.</text>
  ${mark(810, 330, 2.2, B)}<text x="890" y="377" font-family="Inter" font-weight="600" font-size="26" letter-spacing="9" fill="${B}">QAULT</text>`);

// D — Field of chains, full bleed, with the wordmark in a white plate
seed = 3;
save("D-chain-field", `${chains(-20, 1540, 20, 460, 64, B, 0.45)}
  <rect x="520" y="175" width="460" height="150" fill="${W}"/>
  ${mark(560, 205, 3, B)}<text x="670" y="272" font-family="Inter" font-weight="600" font-size="54" letter-spacing="16" fill="${B}">QAULT</text>`);
console.log(fs.readdirSync(OUT).filter(f => f.endsWith(".png")).join("\n"));
