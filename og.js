/* The share card: the picture X, Telegram and Discord show when someone
   posts a QAULT link. 1200 x 630, drawn as SVG and rendered to PNG with
   resvg, using the same two fonts as the page (bundled in fonts/, OFL). */

const fs   = require("fs");
const path = require("path");

let Resvg = null;
try { ({ Resvg } = require("@resvg/resvg-js")); }
catch { console.warn("share cards off: @resvg/resvg-js is not installed"); }

const FONTS = fs.readdirSync(path.join(__dirname, "fonts"))
  .filter(f => f.endsWith(".ttf"))
  .map(f => path.join(__dirname, "fonts", f));

const W = 1200, H = 630;

const COLOR = {
  shielded: "#6ef2a8", program: "#7cb8ff", empty: "#8c89a6",
  low: "#f4e36a", medium: "#ffa94d", high: "#ff5d7a", none: "#7cf3ff"
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const usd = n => n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M"
  : n >= 1000 ? "$" + Math.round(n).toLocaleString("en-US")
  : n >= 1 ? "$" + n.toFixed(2)
  : "$0";

function since(t) {
  if (!t) return "";
  const days = (Date.now() / 1000 - t) / 86400;
  if (days < 1) return "less than a day";
  if (days < 60) return Math.round(days) + " days";
  if (days < 730) return Math.round(days / 30.4) + " months";
  return (days / 365.25).toFixed(1) + " years";
}

/* A small seeded random, so each address gets its own constellation in
   the background and the same address always gets the same one. */
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function field(seed) {
  const r = rng(seed);
  const pts = Array.from({ length: 46 }, () => {
    const x = r() * W, y = r() * H;
    return { x, y, x2: x + (r() - 0.5) * 70, y2: y + (r() - 0.5) * 70 };
  });
  let s = "";
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 170) s += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#a98bff" stroke-opacity="${(0.16 * (1 - d / 170)).toFixed(3)}"/>`;
  }
  for (const p of pts) s +=
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="#7cf3ff" fill-opacity="0.55"/>` +
    `<circle cx="${p.x2.toFixed(1)}" cy="${p.y2.toFixed(1)}" r="2.4" fill="#a98bff" fill-opacity="0.35"/>`;
  return s;
}

/* What the card says, from a check result (or nothing, for the home page). */
function lines(r) {
  if (!r) return {
    badge: "Exposure checker", big: "Q-Day", bigSize: 190,
    sub: "Is your wallet ready?",
    foot: "Paste any Solana address. See what's behind the lock.", level: "none"
  };
  const h = r.history || {};
  const short = r.address.slice(0, 4) + "…" + r.address.slice(-4);
  const age = h.complete && h.oldest ? ` · key public for ${since(h.oldest)}` : "";
  switch (r.level) {
    case "shielded": return { badge: "Shielded", big: "No key", bigSize: 170, sub: "to crack. Nothing to recover.", foot: short + " · off-curve address", level: r.level };
    case "program":  return { badge: "Program", big: "Program", bigSize: 170, sub: "The risk is its upgrade authority.", foot: short, level: r.level };
    case "empty":    return { badge: "Exposed · empty", big: "$0", bigSize: 190, sub: "behind a public key.", foot: short + age, level: r.level };
    default: {
      const big = usd(r.usd);
      return {
        badge: "Exposed · " + r.level, big, bigSize: big.length > 8 ? 150 : 180,
        sub: "behind a public key.", foot: short + age, level: r.level
      };
    }
  }
}

function svg(r, host) {
  const L = lines(r);
  const c = COLOR[L.level];
  const badgeW = 58 + L.badge.length * 15.4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.9">
      <stop offset="0" stop-color="${c}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${c}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="brand" x1="0" x2="1"><stop offset="0" stop-color="#7cf3ff"/><stop offset="1" stop-color="#a98bff"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#07060d"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${field(r ? r.address : "qault")}
  <rect width="${W}" height="8" fill="${c}"/>

  <g transform="translate(72 70)">
    <circle cx="20" cy="20" r="15" fill="none" stroke="#7cf3ff" stroke-width="4"/>
    <path d="M30 30l10 10" stroke="#a98bff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="20" cy="20" r="4.5" fill="#7cf3ff"/>
    <text x="62" y="32" font-family="JetBrains Mono" font-weight="500" font-size="32" letter-spacing="6" fill="#ecebf5">QAULT</text>
  </g>

  <g transform="translate(${W - 72 - badgeW} 72)">
    <rect width="${badgeW}" height="42" rx="21" fill="none" stroke="${c}" stroke-width="2"/>
    <circle cx="22" cy="21" r="6" fill="${c}"/>
    <text x="38" y="29" font-family="JetBrains Mono" font-weight="500" font-size="22" letter-spacing="2" fill="${c}">${esc(L.badge.toUpperCase())}</text>
  </g>

  <text x="68" y="${r ? 340 : 350}" font-family="Space Grotesk" font-weight="700" font-size="${L.bigSize}" letter-spacing="-4" fill="${r ? c : "url(#brand)"}">${esc(L.big)}</text>
  <text x="72" y="${r ? 412 : 425}" font-family="Space Grotesk" font-weight="500" font-size="50" fill="#ecebf5">${esc(L.sub)}</text>
  <text x="72" y="478" font-family="JetBrains Mono" font-weight="500" font-size="26" fill="#9b97b5">${esc(L.foot)}</text>

  <line x1="72" y1="530" x2="${W - 72}" y2="530" stroke="#a98bff" stroke-opacity="0.2"/>
  <text x="72" y="578" font-family="Space Grotesk" font-weight="500" font-size="28" fill="#ecebf5">Is your wallet ready for Q-Day?</text>
  <text x="${W - 72}" y="578" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="24" fill="#7cf3ff">${esc(host || "")}</text>
</svg>`;
}

/* PNG bytes, or null if the renderer isn't available. */
function png(r, host) {
  if (!Resvg) return null;
  return new Resvg(svg(r, host), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Space Grotesk" },
    fitTo: { mode: "width", value: W }
  }).render().asPng();
}

module.exports = { png, svg };
