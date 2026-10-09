//! Winternitz one-time signatures, as QAULT uses them.
//!
//! A one-time key is 34 secret strings. Each one is the start of a hash
//! chain 255 steps long; the end of each chain is public. To sign, the
//! message is turned into 34 numbers (0-255) and, for each, the signer
//! reveals the point that many steps along its chain. Anyone can then walk
//! the rest of each chain and check they arrive at the public ends.
//!
//! Signing reveals part of the key, which is why each key signs exactly
//! once: a vault is spent in a single transaction and whatever is left
//! moves to the next vault, which has a fresh key.
//!
//! Security rests only on the hash function (Keccak-256, truncated to 24
//! bytes), which quantum computers can't meaningfully break — Grover's
//! algorithm at best halves the bits, leaving ~2^96 work per preimage.
//!
//! - 32 message digits (one per byte of the Keccak digest) plus 2 checksum
//!   digits. The checksum is what stops a forger walking chains further to
//!   sign a different message: raising any message digit lowers the
//!   checksum, and a chain can't be walked backwards.
//! - Every hash is tagged with the key's salt, the chain number and the
//!   step, so no two hashes anywhere share an input format: an attacker
//!   can't attack many chains or many vaults at once.
//!
//! This file is shared by the on-chain program and the tests; the browser
//! client (public/vault/wots.js) is the same algorithm in JavaScript, and
//! test vectors keep the two in step.

use solana_keccak_hasher::hashv;

/// Bytes per chain value.
pub const N: usize = 24;
/// 32 message digits + 2 checksum digits.
pub const CHAINS: usize = 34;
/// Length of a chain: digits run 0..=255.
pub const W: u16 = 255;
/// Signature size in bytes.
pub const SIG_LEN: usize = N * CHAINS;
/// Per-key salt.
pub const SALT_LEN: usize = 8;

pub type Salt = [u8; SALT_LEN];
pub type Chunk = [u8; N];

/// One step along chain `chain`, from step `step` to `step + 1`.
#[inline]
fn step(salt: &Salt, chain: u8, step: u8, x: &Chunk) -> Chunk {
    let h = hashv(&[salt, &[chain, step], x]).to_bytes();
    let mut out = [0u8; N];
    out.copy_from_slice(&h[..N]);
    out
}

/// Walk chain `chain` from position `from` to position `to`.
pub fn walk(salt: &Salt, chain: u8, from: u16, to: u16, x: &Chunk) -> Chunk {
    let mut v = *x;
    let mut s = from;
    while s < to {
        v = step(salt, chain, s as u8, &v);
        s += 1;
    }
    v
}

/// The digest a vault signs: everything that decides where the money goes,
/// plus a nonce the signer picks (see `grind`).
pub fn message(program: &[u8; 32], vault: &[u8; 32], to: &[u8; 32], refund: &[u8; 32], amount: u64, nonce: u32) -> [u8; 32] {
    hashv(&[b"QAULT-v1", program, vault, to, refund, &amount.to_le_bytes(), &nonce.to_le_bytes()]).to_bytes()
}

/// How many hashes the verifier will do for this digest: the steps left to
/// walk on every chain. Each costs ~170 compute units on-chain.
pub fn work(msg: &[u8; 32]) -> u32 {
    digits(msg).iter().map(|&d| (W - d as u16) as u32).sum()
}

/// Verification cost varies with the digest — from ~500 hashes to 8,670 —
/// and the worst case would not fit in a transaction's compute budget. So
/// the signer tries nonces until the digest is cheap to verify. About one
/// nonce in twenty passes. This costs no security: the checksum still means
/// a signature can't be stretched to any other digest.
pub const MAX_WORK: u32 = 3_700;

pub fn grind(program: &[u8; 32], vault: &[u8; 32], to: &[u8; 32], refund: &[u8; 32], amount: u64) -> (u32, [u8; 32]) {
    let mut nonce = 0u32;
    loop {
        let m = message(program, vault, to, refund, amount, nonce);
        if work(&m) <= MAX_WORK {
            return (nonce, m);
        }
        nonce += 1;
    }
}

/// The 34 digits to sign: the digest's 32 bytes, then the checksum.
pub fn digits(msg: &[u8; 32]) -> [u8; CHAINS] {
    let mut d = [0u8; CHAINS];
    d[..32].copy_from_slice(msg);
    let sum: u16 = msg.iter().map(|&b| W - b as u16).sum(); // 0..=8160
    d[32] = (sum >> 8) as u8;
    d[33] = (sum & 0xff) as u8;
    d
}

/// Hash of a public key: what a vault address is derived from.
pub fn pubkey_hash(salt: &Salt, ends: &[Chunk; CHAINS]) -> [u8; 32] {
    let mut parts: [&[u8]; CHAINS + 2] = [&[]; CHAINS + 2];
    parts[0] = b"QAULT-pk-v1";
    parts[1] = salt;
    for (i, e) in ends.iter().enumerate() {
        parts[i + 2] = e;
    }
    hashv(&parts).to_bytes()
}

/// Rebuild the public key a signature claims to come from, and hash it.
/// If the signature is genuine for `msg`, this is the vault's key hash.
pub fn recover(salt: &Salt, sig: &[u8], msg: &[u8; 32]) -> Option<[u8; 32]> {
    if sig.len() != SIG_LEN {
        return None;
    }
    let d = digits(msg);
    let mut ends = [[0u8; N]; CHAINS];
    for i in 0..CHAINS {
        let mut x = [0u8; N];
        x.copy_from_slice(&sig[i * N..(i + 1) * N]);
        ends[i] = walk(salt, i as u8, d[i] as u16, W, &x);
    }
    Some(pubkey_hash(salt, &ends))
}

/* ---------- keys (off-chain: tests and tools; the browser does the same) ---------- */

/// A one-time key, derived from the wallet's master seed and the vault's
/// number, so one recovery phrase rebuilds every vault.
pub struct Key {
    pub salt: Salt,
    pub secret: [Chunk; CHAINS],
}

impl Key {
    pub fn derive(seed: &[u8; 32], index: u32) -> Key {
        let ix = index.to_le_bytes();
        let s = hashv(&[b"QAULT-salt-v1", seed, &ix]).to_bytes();
        let mut salt = [0u8; SALT_LEN];
        salt.copy_from_slice(&s[..SALT_LEN]);
        let mut secret = [[0u8; N]; CHAINS];
        for (i, c) in secret.iter_mut().enumerate() {
            let h = hashv(&[b"QAULT-sk-v1", seed, &ix, &[i as u8]]).to_bytes();
            c.copy_from_slice(&h[..N]);
        }
        Key { salt, secret }
    }

    pub fn ends(&self) -> [Chunk; CHAINS] {
        let mut e = [[0u8; N]; CHAINS];
        for i in 0..CHAINS {
            e[i] = walk(&self.salt, i as u8, 0, W, &self.secret[i]);
        }
        e
    }

    pub fn pubkey_hash(&self) -> [u8; 32] {
        pubkey_hash(&self.salt, &self.ends())
    }

    pub fn sign(&self, msg: &[u8; 32]) -> Vec<u8> {
        let d = digits(msg);
        let mut sig = Vec::with_capacity(SIG_LEN);
        for i in 0..CHAINS {
            sig.extend_from_slice(&walk(&self.salt, i as u8, 0, d[i] as u16, &self.secret[i]));
        }
        sig
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_and_verifies() {
        let k = Key::derive(&[7u8; 32], 3);
        let m = message(&[1; 32], &[2; 32], &[3; 32], &[4; 32], 1_000, 0);
        let sig = k.sign(&m);
        assert_eq!(sig.len(), SIG_LEN);
        assert_eq!(recover(&k.salt, &sig, &m), Some(k.pubkey_hash()));
    }

    #[test]
    fn a_signature_does_not_cover_another_message() {
        let k = Key::derive(&[7u8; 32], 3);
        let m1 = message(&[1; 32], &[2; 32], &[3; 32], &[4; 32], 1_000, 0);
        let m2 = message(&[1; 32], &[2; 32], &[3; 32], &[4; 32], 1_001, 0);
        assert_ne!(recover(&k.salt, &k.sign(&m1), &m2), Some(k.pubkey_hash()));
    }

    #[test]
    fn checksum_balances_the_digits() {
        // all-zero digest: every chain fully unwalked, checksum at maximum
        let d = digits(&[0u8; 32]);
        assert_eq!(((d[32] as u16) << 8) | d[33] as u16, 32 * 255);
        let d = digits(&[255u8; 32]);
        assert_eq!((d[32], d[33]), (0, 0));
    }

    #[test]
    fn grinding_finds_a_cheap_digest_quickly() {
        let mut total = 0;
        for amount in 0..200u64 {
            let (nonce, m) = grind(&[1; 32], &[2; 32], &[3; 32], &[4; 32], amount);
            assert!(work(&m) <= MAX_WORK);
            total += nonce + 1;
        }
        assert!(total / 200 < 100, "average {} tries", total / 200);
    }

    #[test]
    fn keys_differ_by_index_and_seed() {
        let a = Key::derive(&[1u8; 32], 0).pubkey_hash();
        assert_ne!(a, Key::derive(&[1u8; 32], 1).pubkey_hash());
        assert_ne!(a, Key::derive(&[2u8; 32], 0).pubkey_hash());
    }
}
