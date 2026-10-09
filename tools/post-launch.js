// The launch post image for X (1600x900), black on white — run: node tools/post-launch.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">EXPOSURE CHECK · SOLANA MAINNET</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="445" font-family="Instrument Serif" font-size="300" letter-spacing="-8" fill="${B}">$1.51B</text>
  <text x="104" y="578" font-family="Instrument Serif" font-size="76" fill="${B}">behind <tspan font-style="italic">one</tspan> public key.</text>
  <text x="104" y="652" font-family="Inter" font-weight="500" font-size="30" fill="${G}">Every ordinary Solana address is its public key, visible to anyone.</text>
  <text x="104" y="696" font-family="Inter" font-weight="500" font-size="30" fill="${G}">A large enough quantum computer could work the private key out from it.</text>
  <line x1="100" y1="760" x2="1500" y2="760" stroke="${L}"/>
  <text x="104" y="818" font-family="Instrument Serif" font-style="italic" font-size="40" fill="${B}">Is your wallet ready for Q-Day?</text>
  <text x="1500" y="818" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="30" fill="${B}">qault.xyz</text></svg>`;
const out = path.join(__dirname, "..", "brand", "posts");
fs.writeFileSync(path.join(out, "launch.svg"), svg);
fs.writeFileSync(path.join(out, "launch.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
console.log("ok");
