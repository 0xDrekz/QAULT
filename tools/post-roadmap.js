// Roadmap image for X (1600x900), black on white — run: node tools/post-roadmap.js
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;
// [title, line 1, line 2, done?]
const STEPS = [
  ["Exposure checker", "Live at qault.xyz", "", true],
  ["Vault on devnet", "Hash-based keys,", "auto-rotating", true],
  ["Open source", "Every line public", "on GitHub", true],
  ["Independent audit", "Brief ready,", "quotes requested", false],
  ["Mainnet beta", "Waitlist first,", "deposit caps on", false],
  ["Multisig", "Shared upgrade key,", "SPL token vaults", false],
];
const X0 = 116, STEP = 236, LY = 520;
const firstOpen = STEPS.findIndex(s => !s[3]);
const xAt = i => X0 + i * STEP;
const line = `<line x1="${xAt(0)}" y1="${LY}" x2="${xAt(firstOpen)}" y2="${LY}" stroke="${B}" stroke-width="3"/>
  <line x1="${xAt(firstOpen)}" y1="${LY}" x2="${xAt(STEPS.length - 1)}" y2="${LY}" stroke="${B}" stroke-width="2" stroke-dasharray="3 9" stroke-linecap="round"/>`;
const nodes = STEPS.map(([t, a, b, done], i) => {
  const x = xAt(i), next = i === firstOpen;
  const dot = done
    ? `<circle cx="${x}" cy="${LY}" r="16" fill="${B}"/><path d="M${x - 7} ${LY} l5 5 l9 -10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${x}" cy="${LY}" r="15" fill="#fff" stroke="${B}" stroke-width="2.5"/>${next ? `<circle cx="${x}" cy="${LY}" r="26" fill="none" stroke="${B}" stroke-width="1.5" stroke-dasharray="4 5"/>` : ""}`;
  return `${dot}
  <text x="${x - 16}" y="${LY - 52}" font-family="JetBrains Mono" font-weight="500" font-size="17" letter-spacing="3" fill="${done ? B : G}">${done ? "DONE" : next ? "NEXT" : "LATER"}</text>
  <text x="${x - 16}" y="${LY + 82}" font-family="Instrument Serif" font-size="33" fill="${B}">${t}</text>
  <text x="${x - 16}" y="${LY + 120}" font-family="Inter" font-size="20" fill="${done ? B : G}">${a}</text>
  ${b ? `<text x="${x - 16}" y="${LY + 148}" font-family="Inter" font-size="20" fill="${done ? B : G}">${b}</text>` : ""}`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">ROADMAP</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="318" font-family="Instrument Serif" font-size="112" letter-spacing="-2" fill="${B}">Built first. <tspan font-style="italic">Audited next.</tspan></text>
  <text x="100" y="384" font-family="Inter" font-size="29" fill="${G}">No real funds go into a QAULT vault until it has passed an independent audit.</text>
  ${line}${nodes}
  <line x1="100" y1="760" x2="1500" y2="760" stroke="${L}"/>
  <text x="104" y="826" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${B}">Join the mainnet waitlist → qault.xyz</text>
  <text x="1500" y="826" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${G}">github.com/0xDrekz/QAULT</text></svg>`;
const out = path.join(__dirname, "..", "brand", "posts");
fs.writeFileSync(path.join(out, "roadmap.svg"), svg);
fs.writeFileSync(path.join(out, "roadmap.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
console.log("ok");
