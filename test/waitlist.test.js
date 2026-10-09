const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { open } = require("../waitlist");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "qault-wl-"));

test("adds, numbers and dedupes sign-ups", () => {
  const dir = tmp();
  const w = open(dir);
  assert.deepStrictEqual(w.add({ email: "Ann@Example.com " }), { ok: true, position: 1 });
  assert.deepStrictEqual(w.add({ wallet: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg" }), { ok: true, position: 2 });
  assert.deepStrictEqual(w.add({ email: "ann@example.com" }), { ok: true, already: true, position: 1 });
  assert.strictEqual(w.count(), 2);
  assert.ok(w.durable, "a directory outside the app counts as durable");
});

test("rejects what isn't an email or an address", () => {
  const w = open(tmp());
  assert.ok(w.add({ email: "not-an-email" }).error);
  assert.ok(w.add({ wallet: "nope" }).error);
  assert.ok(w.add({}).error);
  assert.strictEqual(w.count(), 0);
});

test("survives a restart, and exports CSV", () => {
  const dir = tmp();
  open(dir).add({ email: "b@example.org", wallet: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg" });
  const again = open(dir);
  assert.strictEqual(again.count(), 1);
  assert.match(again.csv(), /^position,email,wallet,joined\n1,"b@example.org","vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",".+"\n$/);
});

test("a list inside the app folder is reported as not durable", () => {
  const dir = path.join(__dirname, "..", "data-test-" + process.pid);
  try { assert.strictEqual(open(dir).durable, false); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
