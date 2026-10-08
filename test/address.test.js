/* node --test — no dependencies.
   Expected values were produced by @solana/web3.js PublicKey.isOnCurve;
   the off-curve ones are associated token account addresses (PDAs). */

const test = require("node:test");
const assert = require("node:assert");
const { decode, onCurve } = require("../address");
const { verdict } = require("../server");

const VECTORS = [
  ["11111111111111111111111111111111", true],
  ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", true],
  ["So11111111111111111111111111111111111111112", true],
  ["Vote111111111111111111111111111111111111111", false],
  ["GDzE4R2jUicTjhkPdHqf3qdWkg3N1vPQqWELnLtKP4Rr", true],
  ["F2njnVRYYtgdAG2DjTY8njmn7uJ2B4EFT1p45GzGrMn9", false],
  ["5PdQpjh7fu4fmApX11WS22paDcwrfFiaH2foYTQ2Wukt", true],
  ["A9ZB7EKHQmmETMvUiTToHdbkPnSyWAKUZnfjQYqJCyd", false],
  ["3dP3ZgvB2K5mttvuRL6S2G3a7dRxjvZ951xUDUt2qewh", true],
  ["99QufMTRyLp9NUAD7vuVen9GUEymCAhMDH9Azkj62LLE", false],
  ["DmqNMURAzKXbkzecHjtzLQMUymKHfQKkUH3U1eeAZrY5", true],
  ["2ExkeMyxdn476aR7VQWowSwezaBYKpvfmtGgMBitV4kM", false]
];

test("on-curve matches Solana", () => {
  for (const [a, want] of VECTORS) assert.strictEqual(onCurve(decode(a)), want, a);
});

test("decode rejects what isn't an address", () => {
  for (const bad of ["", "nope", "0OIl".repeat(10), "1".repeat(45), "abc", null, 42])
    assert.strictEqual(decode(bad), null, String(bad));
  assert.strictEqual(decode("11111111111111111111111111111111").length, 32);
  assert.ok(decode("11111111111111111111111111111111").every(b => b === 0));
});

test("verdict levels", () => {
  assert.strictEqual(verdict({ curve: false, executable: false, usd: 1e9 }), "shielded");
  assert.strictEqual(verdict({ curve: true, executable: true, usd: 5 }), "program");
  assert.strictEqual(verdict({ curve: true, executable: false, usd: 0.5 }), "empty");
  assert.strictEqual(verdict({ curve: true, executable: false, usd: 999 }), "low");
  assert.strictEqual(verdict({ curve: true, executable: false, usd: 50_000 }), "medium");
  assert.strictEqual(verdict({ curve: true, executable: false, usd: 100_000 }), "high");
});
