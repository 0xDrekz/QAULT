// Token launch image for X (1600x900), black on white — run: node tools/post-token.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const CA = "EVScZWpSq7t6Qqje4UBXgH4PZrfTgoS11QV2gwyFpump";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;
const fact = (x, label, value) => `<text x="${x}" y="640" font-family="JetBrains Mono" font-weight="500" font-size="20" letter-spacing="4" fill="${G}">${label}</text><text x="${x}" y="684" font-family="Inter" font-weight="600" font-size="32" fill="${B}">${value}</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">SOLANA · PUMP.FUN</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="380" font-family="Instrument Serif" font-size="210" letter-spacing="-4" fill="${B}">$QAULT</text>
  <text x="104" y="515" font-family="Instrument Serif" font-style="italic" font-size="64" fill="${B}">is live.</text>
  <line x1="100" y1="560" x2="1500" y2="560" stroke="${L}"/>
  ${fact(104, "SUPPLY", "1,000,000,000 fixed")}${fact(560, "MINT AUTHORITY", "Revoked")}${fact(960, "FREEZE AUTHORITY", "Revoked")}
  <line x1="100" y1="740" x2="1500" y2="740" stroke="${L}"/>
  <text x="104" y="798" font-family="JetBrains Mono" font-weight="500" font-size="20" letter-spacing="4" fill="${G}">CA</text>
  <text x="160" y="800" font-family="JetBrains Mono" font-weight="500" font-size="30" fill="${B}">${CA}</text>
  <text x="1500" y="800" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="30" fill="${B}">qault.xyz</text></svg>`;
const out = path.join(__dirname, "..", "brand", "posts");
fs.writeFileSync(path.join(out, "token-launch.svg"), svg);
fs.writeFileSync(path.join(out, "token-launch.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
console.log("ok");
