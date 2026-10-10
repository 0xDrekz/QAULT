// "Every key signs once" image for X (1600x900), black on white — run: node tools/post-once.js
// The chains are a real signature's digits: one point revealed on each of 34 chains.
const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const FONTS = fs.readdirSync(path.join(__dirname, "..", "fonts")).filter(f => f.endsWith(".ttf")).map(f => path.join(__dirname, "..", "fonts", f));
const B = "#000", G = "#7a7a7a", L = "#d9d9d9";
const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="15" cy="15" r="8.5" fill="none" stroke="${B}" stroke-width="1.8"/><path d="M18.6 18.6l5.4 5.4" stroke="${B}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="15" r="2.2" fill="${B}"/></g>`;

(async () => {
  const wots = await import("../public/vault/wots.js");
  const { toBytes } = await import("../public/vault/solana.js");
  const { PROGRAM_ID } = await import("../public/vault/config.js");
  const fill = n => new Uint8Array(32).fill(n);
  const { message } = wots.grind(toBytes(PROGRAM_ID), fill(1), fill(2), fill(3), 1_000_000_000n);
  const d = wots.digits(message);

  // 34 chains, step 0 (secret) at the top, step 255 (public end) at the bottom.
  // Above the revealed point stays secret; below it, anyone can walk to the end.
  const X0 = 880, X1 = 1490, TOP = 245, END = 620, HUB = { x: 1185, y: 700 };
  const xs = Array.from({ length: wots.CHAINS }, (_, i) => X0 + i * ((X1 - X0 - 14) / (wots.CHAINS - 1)) + (i >= 32 ? 14 : 0)); // gap before the 2 checksum chains
  const chains = xs.map((x, i) => {
    const y = TOP + (d[i] / 255) * (END - TOP);
    return `
    <line x1="${x}" y1="${TOP}" x2="${x}" y2="${y}" stroke="${L}" stroke-width="1.5" stroke-dasharray="2 5"/>
    <line x1="${x}" y1="${y}" x2="${x}" y2="${END}" stroke="${B}" stroke-width="1.5"/>
    <circle cx="${x}" cy="${TOP}" r="2.5" fill="${L}"/>
    <circle cx="${x}" cy="${y}" r="5.5" fill="${B}"/>
    <path d="M${x} ${END} C ${x} ${END + 45}, ${HUB.x} ${HUB.y - 50}, ${HUB.x} ${HUB.y - 18}" fill="none" stroke="#bdbdbd" stroke-width="1"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/>
  ${mark(100, 90, 2.2)}<text x="180" y="138" font-family="Inter" font-weight="600" font-size="28" letter-spacing="10" fill="${B}">QAULT</text>
  <text x="1500" y="138" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${G}">THE ONE-TIME KEY</text>
  <line x1="100" y1="190" x2="1500" y2="190" stroke="${L}"/>
  <text x="96" y="380" font-family="Instrument Serif" font-size="150" letter-spacing="-3" fill="${B}">Every key</text>
  <text x="96" y="520" font-family="Instrument Serif" font-size="150" letter-spacing="-3" fill="${B}">signs <tspan font-style="italic">once.</tspan></text>
  ${["Your vault is locked by 34 hash chains.", "A spend reveals one point on each, pays out,", "and moves the rest to a fresh vault", "with a fresh key. The old one is retired."]
    .map((l, i) => `<text x="104" y="${600 + i * 40}" font-family="Inter" font-weight="500" font-size="28" fill="${G}">${l}</text>`).join("")}
  ${chains}
  ${mark(HUB.x - 26, HUB.y - 26, 1.75)}
  <text x="${X0}" y="${TOP - 20}" font-family="JetBrains Mono" font-weight="500" font-size="15" letter-spacing="2" fill="${G}">SECRET</text>
  <text x="${X1}" y="${HUB.y + 60}" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="15" letter-spacing="2" fill="${G}">VAULT = HASH(34 ENDS)</text>
  <line x1="100" y1="790" x2="1500" y2="790" stroke="${L}"/>
  <text x="104" y="842" font-family="Instrument Serif" font-style="italic" font-size="36" fill="${B}">Fig. 2 — one signature, drawn.</text>
  <text x="1500" y="842" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="${B}">qault.xyz · live on devnet</text></svg>`;
  const out = path.join(__dirname, "..", "brand", "posts");
  fs.writeFileSync(path.join(out, "signs-once.svg"), svg);
  fs.writeFileSync(path.join(out, "signs-once.png"), new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
  console.log("ok", Array.from(d).join(","));
})();
