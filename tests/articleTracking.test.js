const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = readFileSync(path.join(__dirname, "../public/js/article.js"), "utf8");
const browserId = "d1689a9f-3799-4e90-b854-c3e720c599ea";
const articleId = "000000000000000000000001";

async function run({ browser = browserId, article = articleId, failure, status = 204 } = {}) {
  const calls = [];
  // Only read access is provided; code attempting to replace HTML fails the test.
  const context = {
    window: { DailyWebBrowserIdentity: { getBrowserId: () => browser } },
    document: { querySelector: () => article ? { dataset: { publicArticleId: article } } : null },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (failure) throw new Error("offline");
      return { ok: status === 204, status };
    },
  };
  await vm.runInNewContext(source, context);
  return calls;
}

test("article enhancement sends exactly one anonymous POST with no session credentials", async () => {
  const calls = await run();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/view-stats");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].options.body), { articleId, browserId });
  assert.equal((await run()).length, 1, "a reload makes a new attempt");
});

test("tracking failures are caught without a retry or content replacement", async () => {
  assert.equal((await run({ failure: true })).length, 1);
  assert.equal((await run({ status: 503 })).length, 1);
  assert.equal((await run({ browser: null })).length, 0);
  assert.equal((await run({ article: null })).length, 0);
});
