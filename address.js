/* What kind of address is this?

   A Solana address is 32 bytes written in base58. Most of them are
   Ed25519 public keys: a point on the curve, with a private key behind
   it. That private key is what a large enough quantum computer could
   work out from the address, which is printed on-chain for anyone.

   Some addresses are deliberately *off* the curve. These are program
   derived addresses (PDAs): no private key exists for them at all, so
   there is nothing for a quantum computer to recover. Whatever controls
   them is a program, and the risk moves to whoever controls that.

   Telling the two apart is a little arithmetic on the curve, done here
   with BigInt so it needs no dependencies. It matches what Solana itself
   does (curve25519-dalek's decompress), and test/address.test.js checks
   it against @solana/web3.js on thousands of addresses. */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, BigInt(i)]));

/* base58 -> bytes, or null if it is not base58 or not 32 bytes. */
function decode(text) {
  if (typeof text !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return null;
  let n = 0n;
  for (const c of text) n = n * 58n + MAP[c];
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of text) { if (c !== "1") break; bytes.unshift(0); }   // leading 1s are leading zero bytes
  return bytes.length === 32 ? Uint8Array.from(bytes) : null;
}

const P = 2n ** 255n - 19n;

function pow(b, e) {
  let r = 1n;
  b %= P;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}

const D = (P - 121665n) * pow(121666n, P - 2n) % P;   // -121665/121666

/* Is this 32-byte string a point on Ed25519?

   The bytes are y (little-endian, top bit is x's sign). The curve says
   x^2 = (y^2 - 1) / (d*y^2 + 1); the point exists exactly when that is a
   square mod p, which Euler's criterion answers. */
function onCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
  y &= (1n << 255n) - 1n;           // drop the sign bit
  y %= P;                           // dalek reduces rather than rejects
  const y2 = y * y % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  if (v === 0n) return false;
  const x2 = u * pow(v, P - 2n) % P;
  return x2 === 0n || pow(x2, (P - 1n) / 2n) === 1n;
}

module.exports = { decode, onCurve };
