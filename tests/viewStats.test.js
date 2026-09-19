const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const app = require("../app");
const Article = require("../models/Article");
const ViewStat = require("../models/ViewStat");
const { hourStart } = require("../services/viewStatService");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, content } = require("./fixtures");
let database, http, publicArticles, hidden;

before(async () => {
  database = await openDatabase("views");
  await ViewStat.createIndexes();
  const { reporter } = await accounts();
  publicArticles = await Article.create(["published", "draft", "pending", "returned"].map((status) => ({
    reporter: reporter._id, status, publishedAt: new Date("2026-01-01T00:00:00Z"),
    publishedContent: content, workingContent: { ...content, body: "PRIVATE_WORKING_BODY" },
  })));
  hidden = await Article.create({ reporter: reporter._id, workingContent: content });
  http = await startHttp(app);
});
beforeEach(async () => { await ViewStat.deleteMany({}); });
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });
const post = (body) => request(http.baseUrl, "/api/view-stats", { method: "POST", body });

test("public views persist counters for every public revision state without modifying Article", async () => {
  const browserId = randomUUID();
  for (const article of publicArticles) {
    const before = await Article.findById(article._id).lean();
    const started = new Date();
    const response = await post({ articleId: String(article._id), browserId });
    assert.equal(response.status, 204);
    assert.equal(response.data, null);
    const stored = await ViewStat.findOne({ article: article._id }).lean();
    assert.equal(stored.browserId, browserId);
    assert.equal(stored.views, 1);
    assert.equal(stored.bucketStart.getTime(), hourStart(stored.lastViewedAt).getTime());
    assert.ok(stored.lastViewedAt >= started && stored.lastViewedAt <= new Date());
    assert.ok(stored.createdAt instanceof Date && stored.updatedAt instanceof Date);
    assert.deepEqual(await Article.findById(article._id).lean(), before);
  }
  assert.equal(await ViewStat.countDocuments(), 4);
});

test("concurrent repeat visits atomically increment one unique bucket; browsers remain separate", async () => {
  const body = { articleId: String(publicArticles[0]._id), browserId: randomUUID() };
  const replies = await Promise.all(Array.from({ length: 20 }, () => post(body)));
  assert.ok(replies.every((reply) => reply.status === 204));
  const rows = await ViewStat.find({ browserId: body.browserId }).lean();
  // A test may cross an hour boundary; each valid hourly bucket remains unique.
  assert.equal(rows.reduce((sum, row) => sum + row.views, 0), 20);
  assert.equal(new Set(rows.map((row) => row.bucketStart.toISOString())).size, rows.length);
  assert.ok(rows.length <= 2);
  assert.equal((await post({ ...body, browserId: body.browserId.toUpperCase() })).status, 204);
  // Native collection avoids Mongoose's lowercase query setter in this assertion.
  assert.equal(await ViewStat.collection.countDocuments({ browserId: body.browserId.toUpperCase() }), 0);
  const second = randomUUID();
  assert.equal((await post({ ...body, browserId: second })).status, 204);
  assert.equal((await ViewStat.findOne({ browserId: second })).views, 1);
  const index = (await ViewStat.collection.indexes()).find((entry) => entry.unique && entry.key.article && entry.key.browserId && entry.key.bucketStart);
  assert.ok(index);
});

test("invalid IDs, browser identity and untrusted extra fields are rejected without writing", async () => {
  const good = { articleId: String(publicArticles[0]._id), browserId: randomUUID() };
  for (const body of [
    {}, null, [], { ...good, articleId: "bad" }, { ...good, articleId: { $ne: null } },
    ...[null, 12, {}, "", "abc", "a".repeat(500), "00000000-0000-0000-0000-000000000000"].map((browserId) => ({ ...good, browserId })),
    ...["views", "role", "publishedContent", "bucketStart", "lastViewedAt"].map((key) => ({ ...good, [key]: "untrusted" })),
  ]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body));
  }
  const query = await request(http.baseUrl, "/api/view-stats?role=editor", { method: "POST", body: good });
  assert.equal(query.status, 400);
  assert.equal(await ViewStat.countDocuments(), 0);
});

test("unpublished, missing and deleted articles cannot receive public views", async () => {
  const browserId = randomUUID();
  const deleted = await Article.create({ reporter: hidden.reporter, workingContent: content, publishedContent: content, publishedAt: new Date() });
  await Article.deleteOne({ _id: deleted._id });
  for (const articleId of [hidden._id, new mongoose.Types.ObjectId(), deleted._id]) {
    const response = await post({ articleId: String(articleId), browserId });
    assert.equal(response.status, 404);
    assert.equal(response.data.error.code, "ARTICLE_NOT_FOUND");
  }
  assert.equal(await ViewStat.countDocuments(), 0);
});

test("duplicate bucket insert recovery retries only the failed increment", async (t) => {
  const articleId = String(publicArticles[0]._id), browserId = randomUUID();
  await post({ articleId, browserId });
  const original = ViewStat.updateOne.bind(ViewStat);
  let attempts = 0;
  t.mock.method(ViewStat, "updateOne", (...args) => {
    attempts++;
    if (attempts === 1) return { maxTimeMS: async () => { throw Object.assign(new Error("duplicate bucket"), { code: 11000 }); } };
    return original(...args);
  });
  assert.equal((await post({ articleId, browserId })).status, 204);
  assert.equal(attempts, 2);
  const rows = await ViewStat.find({ article: articleId, browserId }).lean();
  assert.equal(rows.reduce((sum, row) => sum + row.views, 0), 2);
});

test("SSR is independent of tracking failure and GET/API reads do not increment counters", async (t) => {
  t.mock.method(ViewStat, "updateOne", () => { throw new Error("private database detail"); });
  assert.equal((await post({ articleId: String(publicArticles[0]._id), browserId: randomUUID() })).status, 500);
  const response = await fetch(`${http.baseUrl}/articles/${publicArticles[0]._id}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(content.body));
  assert.ok(!html.includes("PRIVATE_WORKING_BODY"));
  assert.ok(html.includes(`data-public-article-id="${publicArticles[0]._id}"`));
  assert.ok(html.indexOf('/js/browser-identity.js') < html.indexOf('/js/article.js'));
  assert.ok(html.indexOf(content.body) < html.indexOf('/js/article.js'));
  assert.equal((await request(http.baseUrl, `/api/articles/${publicArticles[0]._id}`)).status, 200);
  assert.equal((await request(http.baseUrl, "/api/view-stats")).status, 404);
  assert.equal(await ViewStat.countDocuments(), 0);
});

test("hour buckets are UTC and advance deterministically at the hour boundary", () => {
  assert.equal(hourStart(new Date("2026-09-19T14:59:59.999Z")).toISOString(), "2026-09-19T14:00:00.000Z");
  assert.equal(hourStart(new Date("2026-09-19T15:00:00.000Z")).toISOString(), "2026-09-19T15:00:00.000Z");
  assert.equal(hourStart(new Date("2026-09-19T18:15:00+03:00")).toISOString(), "2026-09-19T15:00:00.000Z");
});
