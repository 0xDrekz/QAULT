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
const og = require("./og");

const PORT    = process.env.PORT || 3000;
const ROOT    = path.join(__dirname, "public");
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
/* The vault runs on devnet for now. DEVNET_RPC_URL if set; otherwise the
   Helius devnet endpoint with the same key as RPC_URL; otherwise public. */
const DEVNET_URL = process.env.DEVNET_RPC_URL
  || (/helius-rpc\.com/.test(RPC_URL) ? RPC_URL.replace("mainnet.helius-rpc.com", "devnet.helius-rpc.com") : "https://api.devnet.solana.com");
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
const MAX_PRICED = 2000;

/* Wallets get airdropped spam tokens, some with made-up prices. A price
   only counts if the token has real liquidity behind it. */
const MIN_LIQUIDITY = 10_000;

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
  // the price API takes 50 ids at a time; ask a few batches at once
  const batches = [];
  for (let i = 0; i < mints.length; i += 50) batches.push(mints.slice(i, i + 50));
  const next = async () => {
    for (let b; (b = batches.shift()); ) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const j = await get(PRICE + b.join(","));
          for (const [m, p] of Object.entries(j || {}))
            if (p && p.usdPrice && (m === SOL_MINT || (p.liquidity || 0) >= MIN_LIQUIDITY))
              out[m] = p.usdPrice;
          break;
        } catch {
          // rate-limited or timed out: back off and try again; after that the
          // tokens are listed without a value, which is not fatal
          await sleep(500 * 2 ** attempt);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, next));
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
  // a wallet can hold thousands of dust tokens; price up to MAX_PRICED of them
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

/* One answer per address for a minute: refreshing, a crowd checking the
   same whale, or the share card for a page just checked, should not each
   cost a round of RPC calls. Cached answers don't count against the limit. */
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

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
}

/* A check, through the cache. Throws if Solana doesn't answer. */
async function cachedCheck(address) {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = await check(address);
  if (!result.error) {
    cache.set(address, { at: Date.now(), result });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
  }
  return result;
}

async function api(req, res, url) {
  const address = (url.searchParams.get("address") || "").trim();
  if (!cache.has(address) && !allowed(ipOf(req)))
    return send(res, 429, JSON.stringify({ error: "Too many checks — wait a minute." }));
  try {
    const result = await cachedCheck(address);
    send(res, result.error ? 400 : 200, JSON.stringify(result));
  } catch (e) {
    console.error("check failed:", e.message);
    send(res, 502, JSON.stringify({ error: "Solana didn't answer in time. Try again in a moment." }));
  }
}

/* ---------- the vault's devnet RPC ----------
   The page talks to Solana through here so the RPC key stays on the
   server. Only the calls the vault makes are passed on, each caller gets a
   generous ceiling (the page polls while waiting for confirmations), and
   airdrops — which spend the faucet — get a tight one of their own. */

const DEVNET_METHODS = new Set([
  "getLatestBlockhash", "sendTransaction", "simulateTransaction", "getSignatureStatuses",
  "getMultipleAccounts", "getAccountInfo", "getBalance", "getSignaturesForAddress", "requestAirdrop"
]);
const devnetHits = new Map(), airdropHits = new Map();

function under(map, ip, limit, windowMs) {
  const now = Date.now();
  const h = (map.get(ip) || []).filter(t => now - t < windowMs);
  h.push(now);
  map.set(ip, h);
  if (map.size > 5000) map.clear();
  return h.length <= limit;
}

function devnet(req, res) {
  const ip = ipOf(req);
  if (req.method !== "POST") return send(res, 405, JSON.stringify({ error: { message: "POST only" } }));
  let body = "";
  req.on("data", c => { body += c; if (body.length > 64_000) req.destroy(); });
  req.on("end", async () => {
    let call;
    try { call = JSON.parse(body); } catch { return send(res, 400, JSON.stringify({ error: { message: "bad JSON" } })); }
    if (!call || !DEVNET_METHODS.has(call.method) || !Array.isArray(call.params ?? []))
      return send(res, 400, JSON.stringify({ error: { message: "method not allowed" } }));
    if (!under(devnetHits, ip, 300, 60_000))
      return send(res, 429, JSON.stringify({ error: { message: "Too many requests — slow down a little." } }));
    if (call.method === "requestAirdrop") {
      if (!under(airdropHits, ip, 5, 60 * 60_000))
        return send(res, 429, JSON.stringify({ error: { message: "Airdrop limit reached — try again in an hour, or use faucet.solana.com." } }));
      // the faucet hands out at most 1 SOL a time
      call.params[1] = Math.min(Number(call.params[1]) || 0, 1_000_000_000);
    }
    try {
      const j = await post(DEVNET_URL, { jsonrpc: "2.0", id: call.id ?? 1, method: call.method, params: call.params ?? [] });
      send(res, 200, JSON.stringify(j));
    } catch (e) {
      send(res, 502, JSON.stringify({ error: { message: "Devnet didn't answer in time. Try again." } }));
    }
  });
}

/* ---------- share cards ----------
   /og.png is the home page's card; /og/<address>.png is a result's.
   Rendered cards are kept for ten minutes: when a link goes round, every
   app that unfurls it asks for the same picture. */

const cards = new Map();
const CARD_MS = 10 * 60_000;

function publicHost(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" ? "https" : "http";
  // the Host header ends up in the page, so only let a plain hostname through
  const host = /^[A-Za-z0-9.-]+(:\d+)?$/.test(req.headers.host || "") ? req.headers.host : "localhost";
  return `${proto}://${host}`;
}

const bare = origin => origin.replace(/^https?:\/\//, "");

async function card(req, res, address) {
  const host = bare(publicHost(req));
  const key = (address || "") + "|" + host;
  const hit = cards.get(key);
  if (hit && Date.now() - hit.at < CARD_MS) return send(res, 200, hit.png, "image/png", { "Cache-Control": "public, max-age=600" });

  let result = null;
  if (address) {
    if (!decode(address)) return send(res, 404, "Not found", "text/plain");
    if (!cache.has(address) && !allowed(ipOf(req))) return send(res, 429, "Too many requests", "text/plain");
    try { result = await cachedCheck(address); }
    catch { result = null; }          // Solana is slow: fall back to the home card rather than nothing
  }
  const png = og.png(result, host);
  if (!png) return send(res, 404, "Not found", "text/plain");
  // only keep a card that shows the real answer
  if (!address || result) {
    cards.set(key, { at: Date.now(), png });
    if (cards.size > 500) cards.delete(cards.keys().next().value);
  }
  send(res, 200, png, "image/png", { "Cache-Control": `public, max-age=${!address || result ? 600 : 60}` });
}

/* The page, with share tags filled in. A link to /?a=<address> gets that
   address's card, so the picture in the post is the result itself. */
const PAGE = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const VAULT_PAGE = fs.readFileSync(path.join(ROOT, "vault", "index.html"), "utf8");

function page(req, res, url) {
  const origin = publicHost(req);
  const a = (url.searchParams.get("a") || "").trim();
  const valid = !!decode(a);
  const image = valid ? `${origin}/og/${a}.png` : `${origin}/og.png`;
  const title = valid ? `QAULT · ${a.slice(0, 4)}…${a.slice(-4)} — is it ready for Q-Day?` : "QAULT — Is your wallet ready for Q-Day?";
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${origin}${valid ? "/?a=" + a : "/"}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:image" content="${image}">`
  ].join("\n  ");
  const html = PAGE
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`)
    .replace("</head>", `  ${tags}\n</head>`);
  send(res, 200, html, TYPES[".html"], { "Cache-Control": "no-cache" });
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
    if (url.pathname === "/api/devnet") return devnet(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
    if (url.pathname === "/" || url.pathname === "/index.html") return page(req, res, url);
    if (url.pathname === "/og.png") return card(req, res, null);
    const m = url.pathname.match(/^\/og\/([1-9A-HJ-NP-Za-km-z]{32,44})\.png$/);
    if (m) return card(req, res, m[1]);
    if (url.pathname === "/vault" || url.pathname === "/vault/" || url.pathname === "/vault/index.html") {
      // share tags need absolute URLs
      const html = VAULT_PAGE.replace('content="/og.png"', `content="${publicHost(req)}/og.png"`);
      return send(res, 200, html, TYPES[".html"], { "Cache-Control": "no-cache" });
    }
    file(res, url.pathname);
  }).listen(PORT, () => console.log(`QAULT on :${PORT} — RPC ${RPC_URL.replace(/api-key=[^&]+/, "api-key=…")}`));
}

module.exports = { check, verdict };
