/* Winternitz one-time signatures — the browser half.

   The same algorithm as program/src/wots.rs, byte for byte; read that file
   for the why. test/vault.test.mjs checks the two agree on vectors printed
   by the Rust code. */

import { keccak_256 } from "./crypto.js";

export const N = 24;            // bytes per chain value
export const CHAINS = 34;       // 32 message digits + 2 checksum digits
export const W = 255;           // chain length
export const SALT_LEN = 8;
export const SIG_LEN = N * CHAINS;
export const MAX_WORK = 3700;   // verifier hashes we allow (keeps it inside the compute budget)

const te = new TextEncoder();
const TAG = {
  msg:  te.encode("QAULT-v1"),
  pk:   te.encode("QAULT-pk-v1"),
  salt: te.encode("QAULT-salt-v1"),
  sk:   te.encode("QAULT-sk-v1")
};

export function concat(...parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const keccak = (...parts) => keccak_256(concat(...parts));

export const u32le = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
export const u64le = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };

/* Walk chain `chain` from position `from` to `to`. One hash per step,
   tagged with the salt, the chain and the step. */
export function walk(salt, chain, from, to, x) {
  let v = x;
  const tag = new Uint8Array(2);
  tag[0] = chain;
  for (let s = from; s < to; s++) {
    tag[1] = s;
    v = keccak(salt, tag, v).slice(0, N);
  }
  return v;
}

/* The digest a vault signs. Addresses are 32-byte arrays. */
export function message(program, vault, to, refund, amount, nonce) {
  return keccak(TAG.msg, program, vault, to, refund, u64le(amount), u32le(nonce));
}

export function digits(msg) {
  const d = new Uint8Array(CHAINS);
  d.set(msg.subarray(0, 32));
  let sum = 0;
  for (let i = 0; i < 32; i++) sum += W - msg[i];
  d[32] = sum >> 8;
  d[33] = sum & 0xff;
  return d;
}

export function work(msg) {
  let w = 0;
  for (const x of digits(msg)) w += W - x;
  return w;
}

/* Try nonces until the digest is cheap enough to verify on-chain. */
export function grind(program, vault, to, refund, amount) {
  for (let nonce = 0; ; nonce++) {
    const m = message(program, vault, to, refund, amount, nonce);
    if (work(m) <= MAX_WORK) return { nonce, message: m };
  }
}

export function pubkeyHash(salt, ends) {
  return keccak(TAG.pk, salt, ...ends);
}

/* A vault's one-time key, from the master seed (32 bytes) and its number. */
export function deriveKey(seed, index) {
  const ix = u32le(index);
  const salt = keccak(TAG.salt, seed, ix).slice(0, SALT_LEN);
  const secret = [];
  for (let i = 0; i < CHAINS; i++) secret.push(keccak(TAG.sk, seed, ix, Uint8Array.of(i)).slice(0, N));
  return { index, salt, secret };
}

export function keyHash(key) {
  const ends = key.secret.map((s, i) => walk(key.salt, i, 0, W, s));
  return pubkeyHash(key.salt, ends);
}

export function sign(key, msg) {
  const d = digits(msg);
  return concat(...key.secret.map((s, i) => walk(key.salt, i, 0, d[i], s)));
}

/* What the program does: rebuild the key hash from a signature. */
export function recover(salt, sig, msg) {
  if (sig.length !== SIG_LEN) return null;
  const d = digits(msg);
  const ends = [];
  for (let i = 0; i < CHAINS; i++) ends.push(walk(salt, i, d[i], W, sig.subarray(i * N, (i + 1) * N)));
  return pubkeyHash(salt, ends);
}
