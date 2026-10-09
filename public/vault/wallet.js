/* The wallet: one recovery phrase → a fuel key for fees, and an endless
   line of vaults, each with its own one-time Winternitz key.

   Vault 0 takes deposits. Spending from it sends the payment, moves the
   rest to vault 1, and retires vault 0's key. And so on. Restoring from
   the phrase walks the line until it finds a vault that was never used. */

import { generateMnemonic, mnemonicToEntropy, validateMnemonic, wordlist, keccak_256 } from "./crypto.js";
import * as wots from "./wots.js";
import * as sol from "./solana.js";
import { PROGRAM_ID, WITHDRAW_UNITS } from "./config.js";

const te = new TextEncoder();
const STORE = "qault.devnet.wallet";
const PENDING = "qault.devnet.pending";

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* fine */ } }
};

export const normalize = p => p.trim().toLowerCase().split(/\s+/).join(" ");
export const newPhrase = () => generateMnemonic(wordlist, 256);   // 24 words
export const validPhrase = p => validateMnemonic(normalize(p), wordlist);

export function open(phrase) {
  const words = normalize(phrase);
  const seed = mnemonicToEntropy(words, wordlist);
  const fuel = sol.keypairFromSeed(keccak_256(wots.concat(te.encode("QAULT-fuel-v1"), seed)));
  return { phrase: words, seed, fuel, vaults: new Map() };
}

/* Remembered on this device — devnet only. A mainnet wallet must not keep
   its phrase in browser storage. */
export const saved = () => store.get(STORE)?.phrase || null;
export const save = w => store.set(STORE, { phrase: w.phrase });
export const forget = () => { store.del(STORE); store.del(PENDING); };

export function vault(w, index) {
  let v = w.vaults.get(index);
  if (!v) {
    const key = wots.deriveKey(w.seed, index);
    const hash = wots.keyHash(key);
    const pda = sol.findProgramAddress([te.encode("vault"), hash], PROGRAM_ID);
    v = { index, key, address: pda.address, bump: pda.bump };
    w.vaults.set(index, v);
  }
  return v;
}

/* Walk the line of vaults: spent ones (empty, with history), then the
   current one, which holds the balance or waits for a first deposit. */
export async function scan(w) {
  const list = [];
  for (let i = 0; ; i++) {
    const v = vault(w, i);
    const [lamports] = await sol.balances([v.address]);
    let status;
    if (lamports > 0) status = "active";
    else {
      const sigs = await sol.rpc("getSignaturesForAddress", [v.address, { limit: 5 }]);
      status = sigs.some(s => !s.err) ? "spent" : "fresh";
      v.lastSig = sigs.find(s => !s.err)?.signature || null;
    }
    list.push({ ...v, lamports, status });
    if (status !== "spent") break;
    if (i > 500) throw new Error("too many vaults to scan");
  }
  const current = list[list.length - 1];
  return { list, current, next: vault(w, current.index + 1) };
}

/* ---------- test SOL ----------
   One faucet trip: test SOL lands on the fuel key, which keeps enough for
   thousands of sends and moves the rest into the vault. */

export const FUEL_KEEP = 20_000_000;   // 0.02 SOL ≈ 4,000 sends at 5,000 lamports each

export const movable = fuelLamports => Math.max(0, fuelLamports - FUEL_KEEP - 5_000);

export async function fuelToVault(w, vaultAddress, fuelLamports) {
  const amount = movable(fuelLamports);
  if (amount < sol.RENT_MIN) throw new Error("The fuel key only holds enough for fees.");
  const tx = sol.buildTransaction(w.fuel, [sol.transfer(w.fuel.address, vaultAddress, amount)], await sol.blockhash());
  return { sig: await sol.sendAndConfirm(tx), amount };
}

/* ---------- sending ---------- */

export function pending() { return store.get(PENDING); }

/* Build and sign a withdraw. The Winternitz signature covers who gets paid,
   how much, and where the change goes — not the blockhash or the fee
   payer — so a payment that didn't land can be resent as-is, with no
   second signature. A one-time key must never sign twice. */
export function prepare(w, current, next, to, lamports) {
  // the change goes to the next vault; with no change, it isn't touched
  // (so it stays fresh, and restoring still finds it)
  const refund = lamports < current.lamports ? next.address : to;
  const p = sol.toBytes(PROGRAM_ID), vb = sol.toBytes(current.address), tb = sol.toBytes(to), rb = sol.toBytes(refund);
  const { nonce, message } = wots.grind(p, vb, tb, rb, BigInt(lamports));
  const sig = wots.sign(current.key, message);
  const data = wots.concat(Uint8Array.of(0), current.key.salt, Uint8Array.of(current.bump), wots.u64le(lamports), wots.u32le(nonce), sig);
  const record = { index: current.index, vault: current.address, to, refund, lamports, data: Array.from(data) };
  store.set(PENDING, record);
  return record;
}

export async function submit(w, record) {
  const ix = {
    program: PROGRAM_ID,
    accounts: [
      { address: record.vault, writable: true, signer: false },
      { address: record.to, writable: true, signer: false },
      { address: record.refund, writable: true, signer: false },
      { address: sol.SYSTEM_PROGRAM, writable: false, signer: false }
    ],
    data: Uint8Array.from(record.data)
  };
  const tx = sol.buildTransaction(w.fuel, [sol.computeLimit(WITHDRAW_UNITS), ix], await sol.blockhash());
  const sig = await sol.sendAndConfirm(tx);
  store.del(PENDING);
  return sig;
}

export const discardPending = () => store.del(PENDING);

/* Before signing: everything Solana would reject, in plain words. */
export async function check(current, to, lamports) {
  if (!sol.isAddress(to)) return "That isn't a Solana address.";
  if (to === current.address) return "That's this vault's own address.";
  if (!(lamports > 0)) return "Enter an amount.";
  if (lamports > current.lamports) return "That's more than the vault holds.";
  const rest = current.lamports - lamports;
  if (rest > 0 && rest < sol.RENT_MIN)
    return `That would leave ${(rest / sol.LAMPORTS).toFixed(6)} SOL, too little for the next vault to hold. Send everything, or leave at least 0.00089 SOL.`;
  const [toBal] = await sol.balances([to]);
  if (toBal === 0 && lamports < sol.RENT_MIN) return "A brand-new address needs at least 0.00089 SOL.";
  return null;
}
