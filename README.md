# QAULT

Quantum-resistant storage for Solana — *the quantum vault*.

- **Exposure checker** (`/`): paste any Solana address and see how exposed it
  is to a future quantum computer.
- **QAULT Vault** (`/vault`, devnet): SOL held behind one-time hash-based
  (Winternitz) keys, with automatic key rotation on every spend.

No wallet connection, no signing, no build step. One dependency
(`@resvg/resvg-js`, for drawing share cards).

## Why

A normal Solana address *is* its Ed25519 public key, printed on-chain for
anyone to read. A large enough quantum computer (running Shor's algorithm)
could work backwards from a public key to its private key. Nobody knows
when — or whether — that day ("Q-Day") arrives. The checker shows what would
be sitting behind each lock if it did.

Some addresses are *off* the curve: program derived addresses (PDAs). No
private key exists for them, so there is nothing to recover. The checker
calls those **shielded**.

## What it reports

| Level            | Meaning                                         |
|------------------|-------------------------------------------------|
| Shielded         | Off-curve (PDA) — no private key exists         |
| Program          | An executable program; the risk is its upgrade authority |
| Exposed · empty  | Public key, nothing worth taking                |
| Exposed · low    | Under $1,000                                    |
| Exposed · medium | $1,000 – $100,000                               |
| Exposed · high   | Over $100,000                                   |

Plus how long the key has been public (from its oldest transaction), its
transaction count, SOL balance and SPL / Token-2022 holdings priced via
Jupiter.

Token prices only count when the token has at least $10k of liquidity on
Jupiter, because wallets get airdropped spam tokens with made-up prices.

"Exposed" describes readiness, not danger today. Solana has a migration
plan (Falcon signatures) that has not been switched on.

## Share cards

Every result link (`/?a=<address>`) carries its own preview image, so a
post on X, Telegram or Discord shows the result itself: the amount, the
verdict and how long the key has been public.

- `/og.png` is the home page's card, and `/og/<address>.png` is a result's.
- Cards are drawn as SVG and rendered to PNG with resvg, using the fonts in
  `fonts/`.
- Rendered cards are cached for ten minutes.

## Layout

```
server.js          static files, GET /api/check?address=…, share cards, share tags
address.js         base58 decoding and the Ed25519 on-curve test (BigInt, no deps)
og.js              the 1200x630 share card
fonts/             Space Grotesk + JetBrains Mono (OFL)
public/            the page: index.html, styles.css, app.js
test/              node --test; on-curve vectors produced by @solana/web3.js
```

## Run it

```
npm install
npm start          # http://localhost:3000
npm test
```

## Deploy on Railway

1. Connect a Railway service to this repo, branch `main`, auto-deploy on.
2. Set **`RPC_URL`** in Railway's variables to a Helius / Triton / QuickNode
   URL (key included). Never commit it.
   Without it the server falls back to Solana's public RPC, which works but
   is rate-limited and can leave token accounts out of very large wallets
   (it dropped ~$1.3B of USDC/USDT from one exchange wallet in testing).
3. Once it has its own domain, set **`PUBLIC_URL`** (e.g. `https://qault.xyz`)
   so share links and cards always point at it.

The server caches each answer for a minute and limits each caller to 20
checks a minute so nobody can burn through the RPC key. It keeps no record
of the addresses checked.

## Mainnet waitlist

A form on the home page takes an email or a Solana wallet address.

- Stored one JSON line per sign-up in `waitlist.jsonl` inside `DATA_DIR`. On Railway, attach a **Volume** mounted at `/data` (picked up automatically), or every redeploy empties the list. `/api/health` shows `waitlist.durable`.
- `GET /api/waitlist/count` gives the number signed up; the form shows it once it reaches 25.
- Download the list at `/api/waitlist/export?token=<ADMIN_TOKEN>`. Set `ADMIN_TOKEN` (16+ characters) in Railway's variables; without it, export is off.
- No IP addresses are kept. Ten tries an hour per caller, plus a hidden field that catches bots.

## Working on it with Claude Code

`.mcp.json` sets up Helius's official MCP server, which gives Claude tools
for reading Solana accounts and transactions. It reads the key from the
`HELIUS_API_KEY` environment variable, so set that in your environment
(locally, or in the cloud environment's settings). The key never goes in
the repo.

## The vault

Auditors: start with [docs/AUDIT.md](docs/AUDIT.md).

```
program/            the on-chain program (Rust)
  src/wots.rs       Winternitz one-time signatures
  src/lib.rs        the Withdraw instruction
  tests/vault.rs    the compiled program in LiteSVM: payments, rotation, theft attempts
  examples/vectors.rs   test vectors for the browser client
public/vault/       the wallet page
  wots.js           the same Winternitz scheme in JavaScript
  solana.js         addresses, PDAs, transactions, RPC — no SDK
  wallet.js         phrase → fuel key + vaults; scan, sign, send
  crypto.js         bundled noble/scure libraries (tools/build-crypto.sh)
```

**How a vault works.** A vault is a program derived address,
`["vault", keccak(one-time public key)]`. No Ed25519 key exists for it, so
its SOL can only move through the program, and only for a valid Winternitz
signature. Depositing is an ordinary transfer to that address.

**Spending.** The browser signs `(program, vault, to, refund, amount, nonce)`
with the vault's one-time key. The program rebuilds the public key from the
signature, checks it hashes to the vault, pays `amount` to `to` and moves
everything else to `refund` — the next vault, with a fresh key. The fee
payer ("fuel key") is an ordinary key with no power over the funds: the
signature fixes where every lamport goes.

**Parameters.** Keccak-256 truncated to 24 bytes (≈2^96 quantum preimage
work); 34 chains of length 255 (32 digest bytes + a 2-byte checksum); every
hash tagged with a per-key salt, the chain and the step. A signature is 816
bytes; a withdraw transaction is 1,180 bytes (limit 1,232). The signer
picks a nonce so the verifier does at most 3,700 hashes (~550k compute
units; a typical send uses ~450–530k).

**Keys.** A 24-word BIP-39 phrase gives the 32-byte seed. Vault *n*'s key
and salt are derived from the seed and *n*; the fuel key from the seed too.
Restoring walks vaults from 0 until it reaches one never used.

**A key signs once.** The signature covers the payment, not the blockhash,
so a payment that didn't land is resent with the same signature. The page
keeps the signed payment until it confirms and won't sign a different one
from the same vault unless told to.

**Devnet.** Program `FFLcbagW5VPNhbnnD2cvGVWM8XSmfouoXAv3xds3Bkzy`, upgrade
authority `3zwsA5ERpCKNU4ZLSRLGHsDJjpKfNSKTWRH72Dr54jcF` (the owner's wallet).
To ship a new build, that wallet signs the upgrade
(`solana program deploy --program-id FFLc… --upgrade-authority <wallet>`). The
page reaches devnet through `/api/devnet` (an allowlist of the calls it
makes); set `DEVNET_RPC_URL`, or it uses Helius devnet with `RPC_URL`'s key.

Build and test:

```
cd program
cargo build-sbf          # needs the Solana (Agave) toolchain
cargo test               # unit tests + the compiled program in LiteSVM
cd .. && npm test        # includes browser-vs-Rust vectors
```

**Not yet:** an independent audit, SPL tokens, hardware-wallet or
encrypted storage for the phrase (it sits in browser storage on devnet).

## Roadmap

1. **Exposure checker** — this.
2. **QAULT Vault on devnet** — done: hash-based (Winternitz) one-time-signature
   vault with automatic key rotation, so it feels like a normal wallet.
3. Our own on-chain program with token support and a migration path to
   Solana's native post-quantum signatures, then an independent audit.
4. Mainnet, with deposit caps at first.
