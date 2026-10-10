// "What's your exposure?" engagement image for X (1600x900), black on white — run: node tools/post-score.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;
// five levels, light to dark: the darker the tile, the more sits behind a public key
const LEVELS = [
  ["Shielded", "No private key", "exists at all", "#fff", B],
  ["Empty", "Key is public,", "nothing behind it", "#ececec", B],
  ["Low", "Under $1k", "behind the key", "#bdbdbd", B],
  ["Medium", "$1k – $100k", "behind the key", "#5c5c5c", "#fff"],
  ["High", "Over $100k", "behind the key", B, "#fff"],
];
const TW = 256, GAP = 30, Y = 450, TH = 270;
const tiles = LEVELS.map(([name, a, b, bg, fg], i) => {
  const x = 100 + i * (TW + GAP);
  return `<rect x="${x}" y="${Y}" width="${TW}" height="${TH}" rx="14" fill="${bg}" stroke="${B}" stroke-width="2"/>
  <text x="${x + 26}" y="${Y + 48}" font-family="JetBrains Mono" font-weight="500" font-size="18" letter-spacing="3" fill="${fg}" opacity=".7">0${i + 1}</text>
  <text x="${x + 24}" y="${Y + 168}" font-family="Instrument Serif" font-size="58" fill="${fg}">${name}</text>
  <text x="${x + 26}" y="${Y + 210}" font-family="Inter" font-size="21" fill="${fg}">${a}</text>
  <text x="${x + 26}" y="${Y + 238}" font-family="Inter" font-size="21" fill="${fg}">${b}</text>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">Q-DAY READINESS</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="318" font-family="Instrument Serif" font-size="118" letter-spacing="-2" fill="${B}">Which one is <tspan font-style="italic">your</tspan> wallet?</text>
  <text x="100" y="392" font-family="Inter" font-size="29" fill="${G}">Paste any Solana address. Read-only, no wallet connection, ten seconds.</text>
  ${tiles}
  <line x1="100" y1="790" x2="1500" y2="790" stroke="${L}"/>
  <text x="104" y="842" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${B}">Check yours → qault.xyz</text>
  <text x="1500" y="842" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${G}">Reply with your result</text></svg>`;
const out = path.join(__dirname, "..", "brand", "posts");
fs.writeFileSync(path.join(out, "which-one.svg"), svg);
fs.writeFileSync(path.join(out, "which-one.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
console.log("ok");
