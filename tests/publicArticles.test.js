const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const app = require("../app");
const Article = require("../models/Article");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, content } = require("./fixtures");
let database, http, expected, hidden;
before(async () => {
  database = await openDatabase("public");
  const { reporter } = await accounts();
  const fixtures = Array.from({ length: 45 }, (_, index) => ({
    reporter: reporter._id, workingContent: { ...content, title: "SECRET WORKING COPY" },
    publishedContent: { ...content, title: `Public ${index}` },
    status: ["published", "draft", "pending", "returned"][index % 4],
    publishedAt: new Date(Date.UTC(2026, 0, 1 + Math.floor(index / 3))),
    editorNote: "SECRET NOTE", publicationHistory: [new Date()],
  }));
  const articles = await Article.insertMany(fixtures);
  expected = articles.sort((a, b) => b.publishedAt - a.publishedAt || String(b._id).localeCompare(String(a._id))).map((article) => String(article._id));
  hidden = await Article.create({ reporter: reporter._id, workingContent: content });
  http = await startHttp(app);
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

test("public MongoDB pagination returns 20/20/5 with stable date and id ordering", async () => {
  let cursor, seen = [];
  for (const size of [20, 20, 5]) {
    const result = await request(http.baseUrl, "/api/articles" + (cursor ? `?cursor=${cursor}` : ""));
    assert.equal(result.status, 200);
    assert.equal(result.data.data.length, size);
    for (const article of result.data.data) {
      assert.deepEqual(Object.keys(article).sort(), ["_id", "title", "summary", "imageUrl", "category", "reporter", "publishedAt"].sort());
      assert.deepEqual(Object.keys(article.reporter).sort(), ["_id", "username"]);
    }
    assert.ok(!JSON.stringify(result.data).includes("SECRET"));
    seen.push(...result.data.data.map((article) => article._id));
    cursor = result.data.meta.nextCursor;
    assert.equal(result.data.meta.hasMore, size === 20);
  }
  assert.equal(cursor, null);
  assert.deepEqual(seen, expected);
  assert.equal(new Set(seen).size, 45);
});

test("public detail returns only approved content, never private draft or unknown article", async () => {
  const result = await request(http.baseUrl, `/api/articles/${expected[0]}`);
  assert.equal(result.status, 200);
  assert.equal(result.data.data.body, content.body);
  assert.ok(!JSON.stringify(result.data).includes("SECRET"));
  assert.deepEqual(Object.keys(result.data.data).sort(), ["_id", "title", "summary", "body", "imageUrl", "category", "reporter", "publishedAt"].sort());
  for (const articleId of [hidden._id, new mongoose.Types.ObjectId()]) assert.equal((await request(http.baseUrl, `/api/articles/${articleId}`)).status, 404);
});

test("public queries reject unsupported filters, malformed IDs and invalid cursors", async () => {
  for (const path of ["/api/articles?limit=500", "/api/articles?status=draft", "/api/articles?cursor=garbage", "/api/articles?cursor=a&cursor=b", "/api/articles/not-an-id", `/api/articles/${expected[0]}?private=true`]) {
    const result = await request(http.baseUrl, path);
    assert.equal(result.status, 400, path);
    assert.equal(typeof result.data.error.code, "string");
    assert.ok(result.data.requestId);
  }
});

test("public pagination index exists and can serve the indexed sort", async () => {
  const indexes = await Article.collection.indexes();
  assert.ok(indexes.some((index) => index.key.publishedAt === -1 && index.key._id === -1));
  const plan = await Article.find({ publishedAt: { $type: "date" }, publishedContent: { $ne: null, $exists: true } })
    .sort({ publishedAt: -1, _id: -1 }).limit(21).hint({ publishedAt: -1, _id: -1 }).explain("executionStats");
  assert.equal(plan.executionStats.nReturned, 21);
  assert.ok(plan.executionStats.totalKeysExamined <= 45);
});
