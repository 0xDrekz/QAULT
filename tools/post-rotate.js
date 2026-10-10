// "One key, one spend" vault-rotation image for X (1600x900), black on white — run: node tools/post-rotate.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;
const W = 340, H = 150, Y = 470;
const vault = (x, n, live) => `
  <rect x="${x}" y="${Y}" width="${W}" height="${H}" rx="14" fill="${live ? B : "#fff"}" stroke="${live ? B : G}" stroke-width="2" ${live ? "" : 'stroke-dasharray="8 7"'}/>
  <text x="${x + 32}" y="${Y + 50}" font-family="JetBrains Mono" font-weight="500" font-size="20" letter-spacing="4" fill="${live ? "#fff" : G}">VAULT ${n}</text>
  <text x="${x + 30}" y="${Y + 104}" font-family="Instrument Serif" font-size="46" fill="${live ? "#fff" : G}">${live ? "Fresh key" : "Key used up"}</text>
  <text x="${x + W - 32}" y="${Y + 50}" text-anchor="end" font-family="Inter" font-weight="600" font-size="20" fill="${live ? "#fff" : G}">${live ? "● active" : "empty"}</text>`;
// arrow from one vault to the next, with a branch down to the payment
const hop = (x1, x2, paid) => {
  const y = Y + H / 2, mid = (x1 + x2) / 2;
  return `<line x1="${x1}" y1="${y}" x2="${x2 - 12}" y2="${y}" stroke="${B}" stroke-width="2"/>
  <path d="M${x2 - 14} ${y - 8} L${x2 - 2} ${y} L${x2 - 14} ${y + 8}" fill="none" stroke="${B}" stroke-width="2" stroke-linejoin="round"/>
  <text x="${mid}" y="${y - 16}" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="17" letter-spacing="2" fill="${G}">THE REST</text>
  <line x1="${mid}" y1="${y}" x2="${mid}" y2="${y + 112}" stroke="${B}" stroke-width="2"/>
  <path d="M${mid - 8} ${y + 100} L${mid} ${y + 112} L${mid + 8} ${y + 100}" fill="none" stroke="${B}" stroke-width="2" stroke-linejoin="round"/>
  <text x="${mid}" y="${y + 148}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" fill="${B}">${paid}</text>`;
};
const xs = [100, 630, 1160];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">ONE KEY · ONE SPEND</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="310" font-family="Instrument Serif" font-size="100" letter-spacing="-2" fill="${B}">One key. One spend. <tspan font-style="italic">Then it's gone.</tspan></text>
  <text x="100" y="384" font-family="Inter" font-size="29" fill="${G}">Every time you send, the rest of your SOL moves to a new vault with a brand-new key.</text>
  ${vault(xs[0], 0, false)}${vault(xs[1], 1, false)}${vault(xs[2], 2, true)}
  ${hop(xs[0] + W, xs[1], "Sent 2 SOL")}${hop(xs[1] + W, xs[2], "Sent 0.5 SOL")}
  <line x1="100" y1="790" x2="1500" y2="790" stroke="${L}"/>
  <text x="104" y="842" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${B}">Try it free on devnet → qault.xyz/vault</text>
  <text x="1500" y="842" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${G}">Open source</text></svg>`;
const out = path.join(__dirname, "..", "brand", "posts");
fs.writeFileSync(path.join(out, "one-key.svg"), svg);
fs.writeFileSync(path.join(out, "one-key.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
console.log("ok");
