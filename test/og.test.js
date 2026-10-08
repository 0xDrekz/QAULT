const test = require("node:test");
const assert = require("node:assert");
const { png, svg } = require("../og");

const base = {
  address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
  history: { complete: true, oldest: Math.floor(Date.now() / 1000) - 86400 * 400 }
};

test("cards render to PNG for every level", () => {
  const results = [null,
    { ...base, level: "shielded" }, { ...base, level: "program" }, { ...base, level: "empty", usd: 0 },
    { ...base, level: "low", usd: 4.4 }, { ...base, level: "medium", usd: 12_345 }, { ...base, level: "high", usd: 1.6e9 }];
  for (const r of results) {
    const out = png(r, "qault.example");
    assert.ok(out && out.length > 1000, r ? r.level : "home");
    assert.strictEqual(out.subarray(1, 4).toString(), "PNG");
  }
});

test("card text is escaped", () => {
  assert.ok(!svg({ ...base, level: "low", usd: 5 }, "<x>").includes("<x>"));
});

test("card shows the amount and age", () => {
  const s = svg({ ...base, level: "high", usd: 1.6e9 }, "q");
  assert.ok(s.includes("$1.60B"));
  assert.ok(s.includes("key public for 13 months"));
});
