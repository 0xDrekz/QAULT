/* The mainnet waitlist.

   One line of JSON per sign-up, appended to waitlist.jsonl in DATA_DIR.
   On Railway that must be a Volume (mounted at /data), or every redeploy
   starts the list from empty — health reports which it is.

   Someone signs up with an email, a Solana wallet address, or both. We
   keep only those and the time. No IP addresses are stored. */

const fs = require("fs");
const path = require("path");
const { decode } = require("./address");

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,24}$/i;

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
  try { if (fs.statSync("/data").isDirectory()) return "/data"; } catch { /* not there */ }
  return path.join(__dirname, "data");
}

function open(dir = dataDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "waitlist.jsonl");
  const seen = new Set();
  const rows = [];
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        rows.push(r);
        if (r.email) seen.add("e:" + r.email);
        if (r.wallet) seen.add("w:" + r.wallet);
      } catch { /* skip a torn line */ }
    }
  } catch { /* no file yet */ }

  // durable = somewhere other than the app's own folder, which redeploys replace
  const durable = !path.resolve(dir).startsWith(path.resolve(__dirname));

  /* Add someone. Returns { ok, position, already } or { error }. */
  function add({ email, wallet }) {
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    wallet = typeof wallet === "string" ? wallet.trim() : "";
    if (email && !EMAIL.test(email)) return { error: "That email doesn't look right." };
    if (wallet && !decode(wallet)) return { error: "That isn't a Solana address." };
    if (!email && !wallet) return { error: "Enter an email or a Solana wallet address." };

    const known = (email && seen.has("e:" + email)) || (wallet && seen.has("w:" + wallet));
    if (known) {
      const i = rows.findIndex(r => (email && r.email === email) || (wallet && r.wallet === wallet));
      return { ok: true, already: true, position: i + 1 };
    }
    const row = { email: email || null, wallet: wallet || null, at: new Date().toISOString() };
    fs.appendFileSync(file, JSON.stringify(row) + "\n");
    rows.push(row);
    if (email) seen.add("e:" + email);
    if (wallet) seen.add("w:" + wallet);
    return { ok: true, position: rows.length };
  }

  function csv() {
    const q = v => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
    return "position,email,wallet,joined\n" + rows.map((r, i) => [i + 1, q(r.email), q(r.wallet), q(r.at)].join(",")).join("\n") + "\n";
  }

  return { add, csv, count: () => rows.length, durable, dir };
}

module.exports = { open, EMAIL };
