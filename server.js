/* QAULT — the exposure checker.

   A static page plus one endpoint, /api/check?address=..., which looks an
   address up on Solana and says how exposed it is to a quantum computer.
   Node built-ins only: no dependencies, nothing to install.

   It runs on the server, not in the page, because a good RPC needs a key
   and a key in the page is a key given to everybody who opens it. Set
   RPC_URL in the host's variables (a Helius / Triton / QuickNode URL with
   its key in it). Without one it falls back to Solana's public RPC, which
   works but is slow and rate-limited. */

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const { decode, onCurve } = require("./address");

const PORT    = process.env.PORT || 3000;
const ROOT    = path.join(__dirname, "public");
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PRICE   = "https://lite-api.jup.ag/price/v3?ids=";
const NAMES   = "https://lite-api.jup.ag/tokens/v2/search?query=";

const SOL_MINT   = "So11111111111111111111111111111111111111112";
const TOKEN      = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8"
};

/* ---------- talking to the outside ---------- */

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      timeout: 15_000
    }, res => {
      let s = "";
      res.on("data", c => (s += c));
      res.on("end", () => { try { resolve(JSON.parse(s)); } catch { reject(new Error(`bad reply (${res.statusCode})`)); } });
    });
    r.on("timeout", () => r.destroy(new Error("timed out")));
    r.on("error", reject);
    r.end(data);
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10_000 }, res => {
      let s = "";
      res.on("data", c => (s += c));
      res.on("end", () => { try { resolve(JSON.parse(s)); } catch { reject(new Error(`bad reply (${res.statusCode})`)); } });
    }).on("timeout", function () { this.destroy(new Error("timed out")); }).on("error", reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The public RPC answers "too many requests" freely; back off and retry
   a few times before giving up. */
async function rpc(method, params) {
  for (let attempt = 0; ; attempt++) {
    const j = await post(RPC_URL, { jsonrpc: "2.0", id: "qault", method, params });
    if (!j.error) return j.result;
    const limited = j.error.code === 429 || /too many requests/i.test(j.error.message || "");
    if (!limited || attempt >= 3) throw new Error(j.error.message || "RPC error");
    await sleep(600 * 2 ** attempt);
  }
}

/* ---------- the check ---------- */

/* How far back to walk an address's history to find when its key first
   appeared. Each page is 1,000 transactions; a very busy address stops
   here and the date is reported as "at least as early as". */
const HISTORY_PAGES = 5;

/* Most wallets hold a handful of tokens; exchanges hold thousands of
   airdropped dust. Beyond this many, the rest are counted but not priced. */
const MAX_PRICED = 250;

/* History is a nice-to-have: if the RPC gives out part way, report what
   was read rather than failing the whole check. */
async function history(address) {
  let before, count = 0, oldest = null, complete = false, newest = null;
  for (let i = 0; i < HISTORY_PAGES; i++) {
    let page;
    try {
      page = await rpc("getSignaturesForAddress", [address, before ? { limit: 1000, before } : { limit: 1000 }]);
    } catch {
      return { count, oldest, newest, complete: false, failed: count === 0 };
    }
    if (!page.length) { complete = true; break; }
    if (!newest) newest = page[0].blockTime || null;
    count += page.length;
    const last = page[page.length - 1];
    oldest = last.blockTime || oldest;
    before = last.signature;
    if (page.length < 1000) { complete = true; break; }
  }
  return { count, oldest, newest, complete };
}

async function tokens(address) {
  const lists = await Promise.all([TOKEN, TOKEN_2022].map(programId =>
    rpc("getTokenAccountsByOwner", [address, { programId }, { encoding: "jsonParsed" }]).catch(() => ({ value: [] }))
  ));
  const held = new Map();
  for (const list of lists) for (const a of list.value || []) {
    const info = a.account?.data?.parsed?.info;
    const amt  = info?.tokenAmount;
    if (!info || !amt || !Number(amt.amount)) continue;
    held.set(info.mint, (held.get(info.mint) || 0) + Number(amt.uiAmountString ?? amt.uiAmount ?? 0));
  }
  return held;
}

async function prices(mints) {
  const out = {};
  // the price API takes 50 ids at a time
  for (let i = 0; i < mints.length; i += 50) {
    try {
      const j = await get(PRICE + mints.slice(i, i + 50).join(","));
      for (const [m, p] of Object.entries(j || {})) if (p && p.usdPrice) out[m] = p.usdPrice;
    } catch { /* no price is not fatal: the token is listed without a value */ }
  }
  return out;
}

/* Symbols, so the list reads "USDC" and not a 44-character mint. */
async function symbols(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 50) {
    try {
      const j = await get(NAMES + mints.slice(i, i + 50).join(","));
      for (const t of Array.isArray(j) ? j : []) if (t.id && t.symbol) out[t.id] = t.symbol;
    } catch { /* unnamed is fine */ }
  }
  return out;
}

/* The verdict, in levels a person can read at a glance. */
function verdict({ curve, executable, usd }) {
  if (!curve) return "shielded";            // no private key exists
  if (executable) return "program";         // risk is the upgrade authority, not this key
  if (usd < 1) return "empty";
  if (usd < 1_000) return "low";
  if (usd < 100_000) return "medium";
  return "high";
}

async function check(address) {
  const bytes = decode(address);
  if (!bytes) return { error: "That is not a Solana address." };
  const curve = onCurve(bytes);

  const [account, hist, held] = await Promise.all([
    rpc("getAccountInfo", [address, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]),
    history(address),
    tokens(address)
  ]);

  const v = account?.value;
  const sol = (v?.lamports || 0) / 1e9;
  const mints = [...held.keys()];
  // a wallet can hold thousands of dust tokens; price the first few hundred
  const px = await prices([SOL_MINT, ...mints.slice(0, MAX_PRICED)]);

  const list = mints.map(mint => {
    const amount = held.get(mint);
    const usd = px[mint] != null ? amount * px[mint] : null;
    return { mint, amount, usd };
  }).sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));

  const shown = list.slice(0, 25);
  const names = await symbols(shown.map(t => t.mint));
  for (const t of shown) t.symbol = names[t.mint] || null;

  const solUsd   = px[SOL_MINT] != null ? sol * px[SOL_MINT] : null;
  const tokenUsd = list.reduce((s, t) => s + (t.usd || 0), 0);
  const usd      = (solUsd || 0) + tokenUsd;

  return {
    address,
    curve,
    exists:     !!v,
    executable: !!v?.executable,
    owner:      v?.owner || null,
    sol,
    solPrice:   px[SOL_MINT] ?? null,
    solUsd,
    tokens:     shown,
    tokenCount: list.length,
    unpriced:   list.filter(t => t.usd == null).length,
    usd,
    history:    hist,
    level:      verdict({ curve, executable: !!v?.executable, usd }),
    checkedAt:  Math.floor(Date.now() / 1000)
  };
}

/* ---------- not getting burned ---------- */

/* One answer per address for a minute: refreshing, or a crowd checking
   the same whale, should not each cost a round of RPC calls. */
const cache = new Map();
const CACHE_MS = 60_000;

/* And a ceiling per caller so nobody can drain the RPC key. */
const hits = new Map();
const LIMIT = 20, WINDOW_MS = 60_000;

function allowed(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  h.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length <= LIMIT;
}

/* ---------- serving ---------- */

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...extra });
  res.end(body);
}

async function api(req, res, url) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (!allowed(ip)) return send(res, 429, JSON.stringify({ error: "Too many checks — wait a minute." }));

  const address = (url.searchParams.get("address") || "").trim();
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.body);

  try {
    const result = await check(address);
    const body = JSON.stringify(result);
    if (!result.error) {
      cache.set(address, { at: Date.now(), body });
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
    }
    send(res, result.error ? 400 : 200, body);
  } catch (e) {
    console.error("check failed:", e.message);
    send(res, 502, JSON.stringify({ error: "Solana didn't answer in time. Try again in a moment." }));
  }
}

function file(res, pathname) {
  const rel  = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT + path.sep)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, data, TYPES[path.extname(full)] || "application/octet-stream",
      { "Cache-Control": path.extname(full) === ".html" ? "no-cache" : "public, max-age=3600" });
  });
}

if (require.main === module) {
  http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/check") return api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
    file(res, url.pathname);
  }).listen(PORT, () => console.log(`QAULT on :${PORT} — RPC ${RPC_URL.replace(/api-key=[^&]+/, "api-key=…")}`));
}

module.exports = { check, verdict };
