/* The share card: the picture X, Telegram and Discord show when someone
   posts a QAULT link. 1200 x 630, drawn as SVG and rendered to PNG with
   resvg, using the page's fonts (bundled in fonts/, OFL): warm paper, deep
   ink, a serif figure, and the hash-chain drawing from the home page. */

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
  shielded: "#2c7a56", program: "#3b6ea8", empty: "#8a8d93",
  low: "#a8822a", medium: "#bd6128", high: "#a8352f", none: "#1f5140"
};
const PAPER = "#f5f2ec", INK = "#17191c", MUTED = "#6b6f76", LINE = "rgba(23,25,28,0.14)", GREEN = "#1f5140", BRASS = "#a8823f";

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

/* The hash-chain drawing, in a panel on the right: one chain per digit,
   a ringed node where the signature reveals it, the public key at the foot. */
function chains(seed, x0, y0, w, h) {
  const r = rng(seed);
  const N = 22, NODES = 18;
  let s = "";
  for (let i = 0; i < N; i++) {
    const phase = r() * 6.28, amp = 0.4 + r() * 0.9, freq = 1.2 + r() * 1.6, sig = 3 + Math.floor(r() * (NODES - 6));
    const pts = [];
    for (let k = 0; k < NODES; k++) {
      const u = k / (NODES - 1);
      const base = x0 + (i / (N - 1)) * w;
      pts.push([base + Math.sin(u * freq * Math.PI + phase) * amp * (w / N) * 1.3, y0 + u * h]);
    }
    s += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${INK}" stroke-opacity="0.45" stroke-width="${i % 5 ? 1 : 1.4}"/>`;
    for (const [x, y] of pts) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="${INK}" fill-opacity="0.35"/>`;
    const [sx, sy] = pts[sig];
    s += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5" fill="none" stroke="${GREEN}" stroke-width="1.6"/>`;
    const walk = pts[Math.min(NODES - 2, sig + 2 + Math.floor(r() * 5))];
    s += `<circle cx="${walk[0].toFixed(1)}" cy="${walk[1].toFixed(1)}" r="3.2" fill="${BRASS}"/>`;
    const [ex, ey] = pts[NODES - 1];
    s += `<rect x="${(ex - 3.5).toFixed(1)}" y="${(ey - 3.5).toFixed(1)}" width="7" height="7" fill="${GREEN}"/>`;
  }
  return s;
}

/* What the card says, from a check result (or nothing, for the home page). */
function lines(r) {
  if (!r) return {
    badge: "Exposure checker", big: "Q-Day", bigSize: 160,
    sub: "Check any Solana address.",
    foot: "Read-only. No wallet, nothing to sign.", level: "none"
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
  const italic = !r;                     // the home card's "Q-Day" is set in italic, like the page
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <g>${chains(r ? r.address : "qault", 850, 96, 270, 380)}</g>
  <line x1="820" y1="64" x2="820" y2="${H - 64}" stroke="${LINE}"/>

  <g transform="translate(72 64)">
    <circle cx="14" cy="14" r="12" fill="none" stroke="${GREEN}" stroke-width="2"/>
    <path d="M23 23l7 7" stroke="${GREEN}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="14" cy="14" r="3" fill="${GREEN}"/>
    <text x="48" y="22" font-family="Inter" font-weight="600" font-size="20" letter-spacing="7" fill="${INK}">QAULT</text>
  </g>

  <g transform="translate(72 150)">
    <circle cx="5" cy="-7" r="5" fill="${c}"/>
    <text x="20" y="0" font-family="JetBrains Mono" font-weight="500" font-size="20" letter-spacing="3" fill="${c}">${esc(L.badge.toUpperCase())}</text>
  </g>

  <text x="66" y="${r ? 330 : 312}" font-family="Instrument Serif" ${italic ? 'font-style="italic"' : ""} font-size="${Math.round(L.bigSize * 0.95)}" letter-spacing="-3" fill="${r ? c : GREEN}">${esc(L.big)}</text>
  <text x="72" y="${r ? 396 : 400}" font-family="Instrument Serif" font-size="50" fill="${INK}">${esc(L.sub)}</text>
  <text x="72" y="452" font-family="JetBrains Mono" font-weight="500" font-size="21" fill="${MUTED}">${esc(L.foot)}</text>

  <line x1="72" y1="${H - 98}" x2="760" y2="${H - 98}" stroke="${LINE}"/>
  <text x="72" y="${H - 58}" font-family="Inter" font-weight="500" font-size="24" fill="${INK}">Is your wallet ready for Q-Day?</text>
  <text x="${W - 72}" y="${H - 58}" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="19" fill="${GREEN}">${esc(host || "")}</text>
  <text x="850" y="${H - 98}" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">Fig. 1: hash chains of a one-time key</text>
</svg>`;
}

/* PNG bytes, or null if the renderer isn't available. */
function png(r, host) {
  if (!Resvg) return null;
  return new Resvg(svg(r, host), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "width", value: W }
  }).render().asPng();
}

module.exports = { png, svg };
