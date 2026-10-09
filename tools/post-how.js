// "How it works" explainer image for X (1600x900), black on white — run: node tools/post-how.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;
// one hash chain: a row of linked dots, the revealed point filled
const chain = (x, y, n, filled) => Array.from({ length: n }, (_, i) =>
  `${i ? `<line x1="${x + (i - 1) * 34 + 6}" y1="${y}" x2="${x + i * 34 - 6}" y2="${y}" stroke="${B}" stroke-width="1.5"/>` : ""}<circle cx="${x + i * 34}" cy="${y}" r="6" fill="${i === filled ? B : "#fff"}" stroke="${B}" stroke-width="1.5"/>`).join("");
const step = (x, n, title, lines) => `
  <text x="${x}" y="560" font-family="JetBrains Mono" font-weight="500" font-size="20" letter-spacing="4" fill="${G}">${n}</text>
  <text x="${x}" y="612" font-family="Instrument Serif" font-size="50" fill="${B}">${title}</text>
  ${lines.map((l, i) => `<text x="${x}" y="${664 + i * 36}" font-family="Inter" font-size="25" fill="${B}">${l}</text>`).join("")}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">HOW IT WORKS</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="320" font-family="Instrument Serif" font-size="104" letter-spacing="-2" fill="${B}">Your address <tspan font-style="italic">is</tspan> your public key.</text>
  <text x="100" y="398" font-family="Inter" font-size="30" fill="${G}">Every Solana wallet shows its public key to the world. QAULT doesn't.</text>
  ${chain(1060, 445, 13, 8)}
  <line x1="100" y1="490" x2="1500" y2="490" stroke="${L}"/>
  ${step(104, "01 · TODAY", "A lock in plain view", ["Your address is the public key.", "Safe, because no computer", "can work backwards from it."])}
  ${step(580, "02 · Q-DAY", "The maths changes", ["A big enough quantum computer", "could derive the private key", "from the public one."])}
  ${step(1056, "03 · QAULT", "Hash-based locks", ["One-time keys quantum can't", "crack. Every spend moves your", "funds to a fresh vault."])}
  <line x1="100" y1="790" x2="1500" y2="790" stroke="${L}"/>
  <text x="104" y="842" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${B}">Check your wallet's exposure → qault.xyz</text>
  <text x="1500" y="842" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${G}">Vault live on devnet</text></svg>`;
const out = path.join(__dirname, "..", "brand", "posts");
fs.writeFileSync(path.join(out, "how-it-works.svg"), svg);
fs.writeFileSync(path.join(out, "how-it-works.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
console.log("ok");
