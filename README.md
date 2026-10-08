# QAULT

Quantum-resistant storage for Solana. This repository starts with the
**exposure checker**: paste any Solana address and see how exposed it is to
a future quantum computer.

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
   is rate-limited — busy wallets will show partial history.
3. Once it has its own domain, set **`PUBLIC_URL`** (e.g. `https://qault.xyz`)
   so share links and cards always point at it.

The server caches each answer for a minute and limits each caller to 20
checks a minute so nobody can burn through the RPC key. It keeps no record
of the addresses checked.

## Roadmap

1. **Exposure checker** — this.
2. **QAULT Vault on devnet** — hash-based (Winternitz) one-time-signature
   vault with automatic key rotation, so it feels like a normal wallet.
3. Our own on-chain program with token support and a migration path to
   Solana's native post-quantum signatures, then an independent audit.
4. Mainnet, with deposit caps at first.
