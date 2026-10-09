/* Just enough Solana to run the vault, with no SDK: addresses, program
   derived addresses, legacy transactions, and JSON-RPC through our server.
   The fewer libraries a wallet page loads, the fewer can be poisoned. */

import { sha256, ed25519, base58 } from "./crypto.js";
import { concat, u32le, u64le } from "./wots.js";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
export const RENT_MIN = 890_880;      // lamports a brand-new empty account must hold
export const LAMPORTS = 1_000_000_000;

export const toBytes = a => (typeof a === "string" ? base58.decode(a) : a);
export const toAddress = b => (typeof b === "string" ? b : base58.encode(b));

/* ---------- is a point on Ed25519? (see address.js on the server) ---------- */

const P = 2n ** 255n - 19n;
function pow(b, e) { let r = 1n; b %= P; while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; }
const D = (P - 121665n) * pow(121666n, P - 2n) % P;

export function onCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
  y &= (1n << 255n) - 1n;
  y %= P;
  const y2 = y * y % P;
  const u = (y2 - 1n + P) % P, v = (D * y2 + 1n) % P;
  if (v === 0n) return false;
  const x2 = u * pow(v, P - 2n) % P;
  return x2 === 0n || pow(x2, (P - 1n) / 2n) === 1n;
}

const PDA_TAG = new TextEncoder().encode("ProgramDerivedAddress");

export function findProgramAddress(seeds, program) {
  const pid = toBytes(program);
  for (let bump = 255; bump >= 0; bump--) {
    const h = sha256(concat(...seeds, Uint8Array.of(bump), pid, PDA_TAG));
    if (!onCurve(h)) return { address: base58.encode(h), bytes: h, bump };
  }
  throw new Error("no program address");
}

export function isAddress(s) {
  try { return toBytes(s.trim()).length === 32; } catch { return false; }
}

/* ---------- keys ---------- */

export function keypairFromSeed(seed32) {
  const publicKey = ed25519.getPublicKey(seed32);
  return { secret: seed32, publicKey, address: base58.encode(publicKey) };
}

/* ---------- transactions (legacy format) ---------- */

function compact(n) {
  const out = [];
  for (;;) {
    let b = n & 0x7f;
    n >>= 7;
    if (n) { out.push(b | 0x80); } else { out.push(b); return Uint8Array.from(out); }
  }
}

/* instructions: [{ program, accounts: [{ address, writable, signer }], data }] */
export function buildTransaction(payer, instructions, blockhash) {
  const metas = new Map();
  const add = (address, writable, signer) => {
    const m = metas.get(address) || { address, writable: false, signer: false };
    m.writable ||= writable; m.signer ||= signer;
    metas.set(address, m);
  };
  add(payer.address, true, true);
  for (const ix of instructions) {
    for (const a of ix.accounts) add(a.address, a.writable, a.signer);
    add(ix.program, false, false);
  }
  const all = [...metas.values()];
  const rank = m => (m.address === payer.address ? -1 : 0) + (m.signer ? 0 : 2) + (m.writable ? 0 : 1);
  all.sort((a, b) => rank(a) - rank(b));
  const signers = all.filter(m => m.signer);
  if (signers.length !== 1) throw new Error("only the fee payer signs");

  const index = new Map(all.map((m, i) => [m.address, i]));
  const header = Uint8Array.of(
    signers.length,
    all.filter(m => m.signer && !m.writable).length,
    all.filter(m => !m.signer && !m.writable).length
  );
  const parts = [header, compact(all.length), ...all.map(m => toBytes(m.address)), toBytes(blockhash), compact(instructions.length)];
  for (const ix of instructions) {
    parts.push(Uint8Array.of(index.get(ix.program)), compact(ix.accounts.length),
      Uint8Array.from(ix.accounts.map(a => index.get(a.address))), compact(ix.data.length), ix.data);
  }
  const msg = concat(...parts);
  const sig = ed25519.sign(msg, payer.secret);
  return concat(compact(1), sig, msg);
}

export const computeLimit = units => ({ program: COMPUTE_BUDGET, accounts: [], data: concat(Uint8Array.of(2), u32le(units)) });

export const transfer = (from, to, lamports) => ({
  program: SYSTEM_PROGRAM,
  accounts: [{ address: from, writable: true, signer: true }, { address: to, writable: true, signer: false }],
  data: concat(u32le(2), u64le(lamports))
});

/* ---------- RPC ---------- */

let rpcId = 0;
export async function rpc(method, params = []) {
  const res = await fetch("/api/devnet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params })
  });
  const j = await res.json().catch(() => ({ error: { message: `devnet answered ${res.status}` } }));
  if (j.error) {
    // a failed simulation carries the program's logs; its last words say why
    const logs = j.error.data?.logs || [];
    const why = [...logs].reverse().find(l => /Program log:|insufficient|failed/i.test(l));
    throw new Error((j.error.message || "devnet error") + (why ? ` — ${why.replace(/^Program log: /, "")}` : ""));
  }
  return j.result;
}

export async function balances(addresses) {
  const out = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const r = await rpc("getMultipleAccounts", [addresses.slice(i, i + 100), { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]);
    for (const a of r.value) out.push(a ? a.lamports : 0);
  }
  return out;
}

export async function blockhash() {
  return (await rpc("getLatestBlockhash", [{ commitment: "confirmed" }])).value.blockhash;
}

const b64 = bytes => btoa(String.fromCharCode(...bytes));

/* Send, then wait until confirmed (or say why it failed). */
export async function sendAndConfirm(tx, { timeout = 60_000 } = {}) {
  const sig = await rpc("sendTransaction", [b64(tx), { encoding: "base64", preflightCommitment: "confirmed" }]);
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const st = (await rpc("getSignatureStatuses", [[sig]])).value[0];
    if (st?.err) throw Object.assign(new Error("transaction failed on-chain"), { sig, detail: st.err });
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    await new Promise(r => setTimeout(r, 1200));
  }
  throw Object.assign(new Error("not confirmed in time — it may still land"), { sig });
}

export async function airdrop(address, lamports) {
  const sig = await rpc("requestAirdrop", [address, lamports]);
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    const st = (await rpc("getSignatureStatuses", [[sig]])).value[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error("airdrop didn't confirm in time");
}
