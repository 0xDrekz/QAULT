/* The browser's Winternitz and Solana code against vectors printed by the
   Rust program (program/examples/vectors.rs). If these drift apart, the
   browser would sign things the program rejects. */

import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import * as wots from "../public/vault/wots.js";
import { findProgramAddress, toBytes } from "../public/vault/solana.js";

const hex = b => Buffer.from(b).toString("hex");
const unhex = h => Uint8Array.from(Buffer.from(h, "hex"));
const { program, vectors } = JSON.parse(readFileSync(new URL("./wots-vectors.json", import.meta.url)));

test("keys, vault addresses, nonces and signatures match the Rust program", () => {
  for (const v of vectors) {
    const key = wots.deriveKey(unhex(v.seed), v.index);
    assert.strictEqual(hex(key.salt), v.salt);
    const pk = wots.keyHash(key);
    assert.strictEqual(hex(pk), v.pubkeyHash);

    const pda = findProgramAddress([new TextEncoder().encode("vault"), pk], program);
    assert.strictEqual(pda.address, v.vault);
    assert.strictEqual(pda.bump, v.bump);

    const g = wots.grind(toBytes(program), toBytes(v.vault), toBytes(v.to), toBytes(v.refund), BigInt(v.amount));
    assert.strictEqual(g.nonce, v.nonce);
    assert.strictEqual(hex(g.message), v.message);
    assert.strictEqual(hex(wots.sign(key, g.message)), v.signature);
    assert.strictEqual(hex(wots.recover(key.salt, unhex(v.signature), g.message)), v.pubkeyHash);
  }
});

test("a signature doesn't verify for another amount", () => {
  const v = vectors[0];
  const key = wots.deriveKey(unhex(v.seed), v.index);
  const other = wots.message(toBytes(program), toBytes(v.vault), toBytes(v.to), toBytes(v.refund), BigInt(v.amount) + 1n, v.nonce);
  assert.notStrictEqual(hex(wots.recover(key.salt, unhex(v.signature), other)), v.pubkeyHash);
});
