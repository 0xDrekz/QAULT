# QAULT Vault — audit brief

Everything an auditor needs to scope, quote and start.

Contact: **Qault_Safe@proton.me** · Code: [github.com/0xDrekz/QAULT](https://github.com/0xDrekz/QAULT) · Site: [qault.xyz](https://qault.xyz)

## 1. What it is

A Solana program that holds SOL behind **one-time Winternitz (hash-based)
signatures**, so funds don't depend on Ed25519, which a large quantum
computer could break. Each spend pays the recipient and moves the
remainder to a fresh vault with a fresh one-time key.

## 2. Scope

| Component | Path | Lines | In scope |
|---|---|---|---|
| On-chain program: Withdraw instruction | `program/src/lib.rs` | 120 | **Yes** |
| Winternitz scheme (shared by program and tests) | `program/src/wots.rs` | ~250 incl. tests | **Yes** |
| Browser Winternitz client (must match the Rust byte for byte) | `public/vault/wots.js` | 110 | **Yes** |
| Browser transaction builder, PDA derivation | `public/vault/solana.js` | 166 | **Yes** |
| Browser wallet: phrase → keys, signing, resend logic | `public/vault/wallet.js` | 141 | **Yes** |
| Vault page UI | `public/vault/app.js` | — | Optional (UX safety only) |
| Exposure checker, website server | `server.js`, `public/app.js` | — | No |

About 790 lines in scope. No Anchor, no third-party on-chain dependencies
beyond `solana-program` 4.x, `solana-system-interface`, `solana-keccak-hasher`.
The browser bundles only `@noble/hashes`, `@noble/curves`, `@scure/bip39`,
`@scure/base` (pinned; `tools/build-crypto.sh`).

## 3. Deployment

| | |
|---|---|
| Network | Solana devnet (mainnet only after audit) |
| Program ID | `FFLcbagW5VPNhbnnD2cvGVWM8XSmfouoXAv3xds3Bkzy` |
| Upgrade authority | `3zwsA5ERpCKNU4ZLSRLGHsDJjpKfNSKTWRH72Dr54jcF` (single key today; see §8) |
| Deployed binary SHA-256 | `0b6ba1ffc3bae2edf5373fd6470ffa61dad9dd2bf026e4c7c98a6394407bb4c5` |
| Toolchain | Agave / platform-tools v1.57, `cargo build-sbf`, Rust 1.97.1 (`program/rust-toolchain.toml`) |

To compare the deployed program with a local build:
`solana program dump -u devnet FFLc… deployed.so && sha256sum deployed.so`.

## 4. How it works

**Vault address.** `PDA(["vault", keccak256("QAULT-pk-v1" ‖ salt ‖ pk₀ ‖ … ‖ pk₃₃)], program)`.
No Ed25519 key exists for it. It stays a system-owned account with no data.
Depositing is an ordinary system transfer to it.

**Withdraw** (the only instruction). Data: `0x00 ‖ salt[8] ‖ bump[1] ‖ amount u64 ‖ nonce u32 ‖ sig[816]` (838 bytes).
Accounts: `vault (w)`, `to (w)`, `refund (w)`, `system_program`.

1. `m = keccak256("QAULT-v1" ‖ program_id ‖ vault ‖ to ‖ refund ‖ amount ‖ nonce)`.
2. Digits = the 32 bytes of `m`, plus a 2-digit base-256 checksum of Σ(255 − dᵢ).
3. For each of 34 chains, walk the signature value from step dᵢ to step 255:
   `xₛ₊₁ = keccak256(salt ‖ chain ‖ s ‖ xₛ)[0..24]`.
4. Hash the 34 chain ends into `pk`; check `create_program_address(["vault", pk, bump]) == vault`.
5. Transfer `amount` to `to` and **all remaining lamports** to `refund`, signing for the vault PDA. The vault ends at 0.

**Parameters.** Keccak-256 truncated to 24 bytes (≈2^192 classical, ≈2^96 Grover
preimage); w = 256 (8-bit digits); 34 chains; a per-key 8-byte salt and the
(chain, step) pair are in every hash input.

**Nonce grinding.** The signer tries nonces until Σ(255 − dᵢ) over all 34 digits
is ≤ 3,700. That bounds verification at about 550k compute units, against a
worst case of about 1.47M. It isn't enforced on-chain, and a signer that skips it
only risks running out of compute.

**Key derivation (client).** BIP-39 24-word phrase → 32-byte entropy `seed`.
Vault n: `salt = keccak("QAULT-salt-v1" ‖ seed ‖ n_le32)[0..8]`,
`skᵢ = keccak("QAULT-sk-v1" ‖ seed ‖ n_le32 ‖ i)[0..24]`.
Fee payer ("fuel key"): Ed25519 from `keccak("QAULT-fuel-v1" ‖ seed)`.

## 5. Security properties we claim — please try to break these

1. **Only the key holder can move a vault's funds.** No signature other than a
   valid Winternitz signature from the vault's own key passes step 4.
2. **A signature authorises exactly one payment.** It binds program, vault,
   recipient, change address, amount and nonce. Changing any of them fails
   (tests: swapped `to`, swapped `refund`, changed amount, tampered byte).
3. **One published signature doesn't enable a forgery** for any other message
   (checksum; test `a_seen_signature_cannot_be_walked_forward_to_another_message`).
4. **The fee payer has no authority.** A compromised or quantum-broken fee payer,
   or a front-runner copying the transaction, can only reproduce the same payment.
5. **No value is lost or stranded by the program.** After a successful withdraw
   the vault holds 0 and `amount + rest == previous balance`.
6. **The browser and the program agree.** The JS produces identical salts, key
   hashes, PDAs, nonces, digests and signatures (`test/wots-vectors.json`, generated
   by `program/examples/vectors.rs`).

## 6. Known limitations and design choices (not bugs, but please weigh in)

| # | Item | Notes |
|---|---|---|
| L1 | **A key must sign only once.** | A second signature from the same key, for a different message, weakens it. The program can't stop that; the wallet keeps a signed payment and resends the *same* signature if it didn't land (the signature doesn't cover the blockhash), and won't sign a different one without an explicit override. |
| L2 | **Funds sent to an already-spent vault** | can only be moved with a second signature (see L1). The wallet never shows an old address for deposits, but a user could reuse one. |
| L3 | **Replay after a refill.** | If a spent vault is refilled, the old transaction can be replayed. It pays only the original recipient and change address, so no third party gains. |
| L4 | **Bump is caller-supplied.** | `create_program_address` with any bump must still equal `vault`, and it's bound to `pk`. We don't require the canonical bump. Is that a concern? |
| L5 | **24-byte truncation.** | Chosen to fit the 1,232-byte transaction limit (a withdraw is 1,180 bytes). 2^96 Grover preimage work; multi-target attacks are limited by the per-key salt and per-position tags. |
| L6 | **Rent.** | A new `to` or `refund` account receiving less than the rent-exempt minimum makes the transaction fail. The wallet checks this beforehand; the program doesn't. |
| L7 | **SOL only.** | SPL tokens are out of scope for this audit. |
| L8 | **Phrase storage (client).** | On devnet the phrase is kept in `localStorage`. Mainnet will need encryption or hardware support; we'd value recommendations. |

## 7. Tests

```
cd program
cargo build-sbf
cargo test        # 6 unit tests (wots) + 9 LiteSVM tests against the compiled .so
cd .. && npm test # includes browser-vs-Rust vectors
```

LiteSVM tests: deposit/send/rotate, chained rotation across vaults, send
everything, wrong amount, redirected recipient, redirected change, another
vault's key, tampered signature, replay of a spent vault, and the costliest
allowed signature within the compute budget. Each also asserts the transaction
fits in 1,232 bytes.

Devnet: three sends across vaults 0→3 plus a restore from the phrase, run end to
end in a browser against the deployed program. Recipient balances were checked
to the lamport. Measured compute: 455k–530k units per withdraw.

## 8. Before mainnet (our plan)

- Move the upgrade authority to a multisig (e.g. Squads) with a time lock, or
  make the program immutable once audited.
- Encrypted phrase storage; hardware-wallet signing if feasible.
- Deposit caps during the beta.
- A verifiable build (`solana-verify`) published with the audit report.
