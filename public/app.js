/* QAULT — the page. Asks /api/check about an address and shows the answer. */

const $ = s => document.querySelector(s);
const form = $("#form"), input = $("#address"), go = $("#go"), out = $("#result");

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const usd = n => n == null ? "—"
  : n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M"
  : n >= 1000 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : n >= 1 ? "$" + n.toFixed(2)
  : n > 0 ? "<$1" : "$0";

const num = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M"
  : n >= 1e3 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 4 : 6 });

const date = t => t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function since(t) {
  if (!t) return "";
  const days = (Date.now() / 1000 - t) / 86400;
  if (days < 1) return "today";
  if (days < 60) return Math.round(days) + " days";
  if (days < 730) return Math.round(days / 30.4) + " months";
  return (days / 365.25).toFixed(1) + " years";
}

const short = a => a.slice(0, 4) + "…" + a.slice(-4);

/* What to say for each level. Plain words, and no scaring people: nothing
   is at risk today, this is about being ready. */
function words(r) {
  const h = r.history;
  const when = h.oldest && h.complete ? `since ${date(h.oldest)}` : "";
  switch (r.level) {
    case "shielded": return {
      badge: "Shielded",
      title: "No key to crack.",
      say: "This address is off the curve: it's a program derived address, and no private key exists for it. A quantum computer has nothing to recover here. Whatever controls it is a program, so the risk sits with whoever controls that program."
    };
    case "program": return {
      badge: "Program",
      title: "This is a program, not a wallet.",
      say: "A program's own address being public doesn't matter much. What matters is its upgrade authority, which is an ordinary key. Check that address to see how exposed it is."
    };
    case "empty": return {
      badge: "Exposed · empty",
      title: r.exists || h.count ? "The key is public, but there's nothing behind it." : "Nothing here yet.",
      say: r.exists || h.count
        ? `This is a normal Solana key, public ${when || "on-chain"}. It holds nothing worth taking, so there's nothing at stake.`
        : "This address has never been used on Solana. The moment it is, its public key will be on-chain like every other wallet's."
    };
    default: return {
      badge: "Exposed · " + r.level,
      title: "This key is public.",
      say: `This is a normal Solana wallet: its address is its public key, and that's been visible ${when || "on-chain"}. Nothing can break it today. But if a quantum computer ever can, this is what would be sitting behind the lock. Every ordinary Solana wallet is in the same position.`
    };
  }
}

function render(r) {
  const w = words(r);
  const h = r.history;
  out.dataset.level = r.level;

  const facts = [
    ["Address type", r.curve ? "Normal key (on-curve)" : "No key (off-curve)"],
    r.curve && ["Key public for",
      h.failed ? "couldn't read"
      : !h.complete ? "too busy to date"
      : h.oldest ? since(h.oldest) : "never used"],
    ["Transactions", h.failed ? "—" : h.count ? h.count.toLocaleString("en-US") + (h.complete ? "" : "+") : "0"],
    ["SOL", num(r.sol) + (r.solUsd ? ` · ${usd(r.solUsd)}` : "")],
    ["Tokens", r.tokenCount ? `${r.tokenCount}` + (r.unpriced ? ` (${r.unpriced} unpriced)` : "") : "0"]
  ].filter(Boolean);

  const rows = r.tokens.map(t => `
    <tr>
      <td>${t.symbol ? esc(t.symbol) : `<span class="mint">${short(t.mint)}</span>`}</td>
      <td>${num(t.amount)}</td>
      <td>${usd(t.usd)}</td>
    </tr>`).join("");

  const showBig = r.curve && !r.executable && r.usd >= 1;
  const link = location.origin + "/?a=" + r.address;
  const tweet = r.level === "shielded"
    ? "This Solana address is shielded from quantum computers: no private key exists. Check yours:"
    : showBig ? `${usd(r.usd)} sits behind a public key${h.complete && h.oldest ? ` that's been on-chain for ${since(h.oldest)}` : ""}. Is this wallet ready for Q-Day?`
    : "Is your wallet ready for Q-Day? Check any Solana address:";

  out.innerHTML = `
    <span class="badge">${esc(w.badge)}</span>
    <h2>${esc(w.title)}</h2>
    <p class="addr"><a href="https://solscan.io/account/${r.address}" target="_blank" rel="noopener">${r.address}</a></p>
    ${showBig ? `<p class="big">${usd(r.usd)}</p><p class="big-label">would be behind the lock on Q-Day</p>` : ""}
    <p class="say">${esc(w.say)}</p>
    <div class="facts">${facts.map(([k, v]) => `<div class="fact"><b>${k}</b><span>${esc(v)}</span></div>`).join("")}</div>
    ${rows ? `<details${r.tokens.length <= 6 ? " open" : ""}><summary>Tokens held${r.tokenCount > r.tokens.length ? ` (top ${r.tokens.length} of ${r.tokenCount})` : ""}</summary>
      <table class="tokens"><thead><tr><th>Token</th><th>Amount</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table></details>` : ""}
    <div class="share">
      <button type="button" id="copy">Copy link</button>
      <a href="https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(link)}" target="_blank" rel="noopener">Post on X</a>
    </div>`;

  $("#copy").onclick = async e => {
    try { await navigator.clipboard.writeText(link); e.target.textContent = "Copied"; }
    catch { prompt("Copy this link:", link); }
  };
}

async function run(address) {
  address = address.trim();
  if (!address) return;
  out.hidden = false;
  delete out.dataset.level;
  out.innerHTML = `<div class="loading"><div class="orb"></div>Collapsing the wave function… reading ${esc(short(address))} from Solana</div>`;
  go.disabled = true;
  history.replaceState(null, "", "/?a=" + encodeURIComponent(address));
  try {
    const res = await fetch("/api/check?address=" + encodeURIComponent(address));
    const r = await res.json();
    if (r.error) throw new Error(r.error);
    render(r);
  } catch (e) {
    out.innerHTML = `<p class="error">${esc(e.message || "Something went wrong.")}</p>`;
  } finally {
    go.disabled = false;
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

form.addEventListener("submit", e => { e.preventDefault(); run(input.value); });

const start = new URLSearchParams(location.search).get("a");
if (start) { input.value = start; run(start); }

/* ---------- the background: points in superposition ----------
   Every point flickers between two possible positions and is drawn at
   both, faintly, joined to its neighbours. Purely decoration. */
(() => {
  const c = $("#field"), x = c.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, pts;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr;
    const n = Math.round(Math.min(90, (innerWidth * innerHeight) / 16000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      dx: (Math.random() - 0.5) * 60 * dpr, dy: (Math.random() - 0.5) * 60 * dpr,
      vx: (Math.random() - 0.5) * 0.15 * dpr, vy: (Math.random() - 0.5) * 0.15 * dpr,
      ph: Math.random() * Math.PI * 2, sp: 0.004 + Math.random() * 0.01
    }));
  }
  function frame() {
    x.clearRect(0, 0, w, h);
    const link = Math.min(w, h) * 0.16;
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; p.ph += p.sp;
      p.a = (Math.sin(p.ph) + 1) / 2;                           // weight on state A vs B
      p.px = p.x + p.dx * (1 - p.a); p.py = p.y + p.dy * (1 - p.a);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.px - b.px, a.py - b.py);
      if (d < link) {
        x.strokeStyle = `rgba(169,139,255,${0.12 * (1 - d / link)})`;
        x.beginPath(); x.moveTo(a.px, a.py); x.lineTo(b.px, b.py); x.stroke();
      }
    }
    for (const p of pts) {
      x.fillStyle = `rgba(124,243,255,${0.25 + 0.5 * p.a})`;
      x.beginPath(); x.arc(p.x, p.y, 1.6, 0, 7); x.fill();
      x.fillStyle = `rgba(169,139,255,${0.25 + 0.5 * (1 - p.a)})`;
      x.beginPath(); x.arc(p.x + p.dx, p.y + p.dy, 1.6, 0, 7); x.fill();
    }
    if (!still) requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { size(); if (still) frame(); });
  size(); frame();
})();
