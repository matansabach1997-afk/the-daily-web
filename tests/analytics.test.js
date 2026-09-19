const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const app = require("../app");
const Article = require("../models/Article");
const ViewStat = require("../models/ViewStat");
const { getAnalytics } = require("../services/viewStatService");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, content, login } = require("./fixtures");
let database, http, articles, hidden, users, editorCookie, reporterCookie;
const browserA = randomUUID(), browserB = randomUUID();
const totals = new Map(), seen = new Set();
const history = ["2026-01-01T00:30:00.000Z", "2026-01-02T12:15:00.000Z", "2026-01-05T09:00:00.000Z"];

before(async () => {
  database = await openDatabase("analytics");
  await ViewStat.createIndexes();
  users = await accounts();
  articles = await Article.insertMany(Array.from({ length: 65 }, (_, index) => ({
    reporter: users.reporter._id,
    workingContent: { ...content, title: "PRIVATE_TITLE", body: "PRIVATE_BODY" },
    publishedContent: { ...content, title: `Telescope ${index}`, category: index < 45 ? "science" : "sport" },
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, Math.floor(index / 3))),
    status: ["published", "draft", "pending", "returned"][index % 4],
    publicationHistory: history.map((value) => new Date(value)), editorNote: "PRIVATE_NOTE",
  })));
  hidden = await Article.create({ reporter: users.reporter._id, workingContent: content });
  const rows = [];
  function bucket(article, browserId, views, time) {
    rows.push({ article: article._id, browserId, views, bucketStart: new Date(time), lastViewedAt: new Date(time) });
    const key = String(article._id);
    totals.set(key, (totals.get(key) || 0) + views);
    if (browserId === browserA) seen.add(key);
  }
  bucket(articles[0], browserA, 3, "2026-01-01T00:00:00Z");
  bucket(articles[0], browserB, 7, "2026-01-01T00:00:00Z");
  bucket(articles[0], browserA, 5, "2026-01-04T00:00:00Z");
  for (let i = 1; i < 50; i++) {
    bucket(articles[i], browserB, i === 1 ? 40 : i % 7 + 1, "2026-01-01T00:00:00Z");
    if (i < 46 && i % 2 === 0) {
      bucket(articles[i], browserA, 2, "2026-01-01T00:00:00Z");
      bucket(articles[i], browserA, 3, "2026-01-02T00:00:00Z");
    }
  }
  bucket(hidden, browserA, 10000, "2026-01-01T00:00:00Z");
  bucket({ _id: new mongoose.Types.ObjectId() }, browserA, 20000, "2026-01-01T00:00:00Z");
  await ViewStat.insertMany(rows);
  http = await startHttp(app);
  editorCookie = await login(http.baseUrl, users.editor);
  reporterCookie = await login(http.baseUrl, users.reporter);
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

async function pages(params) {
  const rows = [], sizes = [];
  let cursor;
  do {
    const query = new URLSearchParams(params);
    if (cursor) query.set("cursor", cursor);
    const response = await request(http.baseUrl, `/api/articles?${query}`);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    rows.push(...response.data.data);
    sizes.push(response.data.data.length);
    cursor = response.data.meta.nextCursor;
    assert.equal(response.data.meta.hasMore, cursor !== null);
    assert.ok(sizes.length <= 5);
  } while (cursor);
  assert.equal(new Set(rows.map((row) => row._id)).size, rows.length);
  assert.ok(!JSON.stringify(rows).includes("PRIVATE"));
  return { rows, sizes };
}

test("popularity sums all browsers/hours, includes zero-view articles, stable 20-item pages", async () => {
  const { rows, sizes } = await pages({ sort: "popularity" });
  const expected = [...articles].sort((a, b) => (totals.get(String(b._id)) || 0) - (totals.get(String(a._id)) || 0) || String(b._id).localeCompare(String(a._id)));
  assert.deepEqual(rows.map((row) => row._id), expected.map((row) => String(row._id)));
  assert.deepEqual(sizes, [20, 20, 20, 5]);
  assert.equal(rows[0]._id, String(articles[1]._id));
  assert.equal(rows.find((row) => row._id === String(articles[0]._id)).totalViews, 15);
  assert.equal(rows.filter((row) => row.totalViews === 0).length, 15);
  assert.ok(rows.every((row) => row.totalViews === (totals.get(row._id) || 0)));
  assert.ok(!JSON.stringify(rows).includes(browserA));
});

test("viewed existence composes with search/category/all sorts BEFORE pagination", async () => {
  for (const viewed of ["true", "false"]) {
    for (const sort of ["newest", "oldest", "popularity"]) {
      const { rows, sizes } = await pages({ q: "telescope", category: "science", sort, viewed, browserId: browserA.toUpperCase() });
      const expected = articles.slice(0, 45).filter((article) => seen.has(String(article._id)) === (viewed === "true"));
      const direction = sort === "oldest" ? 1 : -1;
      expected.sort((a, b) => sort === "popularity" ?
        (totals.get(String(b._id)) || 0) - (totals.get(String(a._id)) || 0) || String(b._id).localeCompare(String(a._id)) :
        direction * (a.publishedAt - b.publishedAt || String(a._id).localeCompare(String(b._id))));
      assert.deepEqual(rows.map((row) => row._id), expected.map((row) => String(row._id)));
      assert.equal(sizes[0], 20);
      assert.ok(sizes[1] > 0);
    }
  }
  assert.equal((await pages({ viewed: "true", browserId: randomUUID() })).rows.length, 0);
  assert.equal((await pages({ viewed: "false", browserId: randomUUID() })).rows.length, 65);
});

test("normal anonymous feed still works; invalid identity/filter/cursor values are rejected", async () => {
  assert.equal((await request(http.baseUrl, "/api/articles")).status, 200);
  assert.equal((await request(http.baseUrl, "/api/articles?sort=popularity")).status, 200);
  for (const query of [
    "viewed=true", "viewed=false&browserId=bad", `viewed=yes&browserId=${browserA}`,
    `viewed=true&viewed=false&browserId=${browserA}`, "browserId=bad", "viewedIds[]=one",
    `viewed=true&browserId=${browserA}&browserId=${browserB}`, "sort=popularity&cursor=bad",
  ]) assert.equal((await request(http.baseUrl, "/api/articles?" + query)).status, 400, query);
  for (const value of [-1, 1.2, "15", null, Number.MAX_SAFE_INTEGER + 1]) {
    const cursor = Buffer.from(JSON.stringify({ value, id: String(articles[0]._id) })).toString("base64url");
    assert.equal((await request(http.baseUrl, `/api/articles?sort=popularity&cursor=${cursor}`)).status, 400);
  }
});

function analyticsPath(articleId = articles[0]._id) {
  return `/api/view-stats/articles/${articleId}/analytics`;
}
test("analytics groups hours across browsers, separates lifetime and period totals, preserves real markers", async () => {
  const query = new URLSearchParams({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-03T00:00:00.000Z" });
  const result = await request(http.baseUrl, `${analyticsPath()}?${query}`, { cookie: editorCookie });
  assert.equal(result.status, 200);
  const data = result.data.data;
  assert.equal(data.totalViews, 15);
  assert.equal(data.periodViews, 10);
  assert.deepEqual(data.series, [{ bucketStart: "2026-01-01T00:00:00.000Z", views: 10 }]);
  assert.deepEqual(data.publicationMarkers, [{ at: history[0], type: "publication" }, { at: history[1], type: "update" }]);
  const longer = await request(http.baseUrl, `${analyticsPath()}?from=2026-01-01T00:00:00.000Z&to=2026-01-05T00:00:00.000Z`, { cookie: editorCookie });
  assert.equal(longer.status, 200);
  assert.equal(longer.data.data.periodViews, 15);
  assert.deepEqual(longer.data.data.series, [
    { bucketStart: "2026-01-01T00:00:00.000Z", views: 10 },
    { bucketStart: "2026-01-04T00:00:00.000Z", views: 5 },
  ]);
  const later = await request(http.baseUrl, `${analyticsPath()}?from=2026-01-02T00:00:00.000Z&to=2026-01-04T00:00:00.000Z`, { cookie: editorCookie });
  assert.equal(later.status, 200);
  assert.equal(later.data.data.periodViews, 0); // The exclusive end omits the Jan 4 bucket.
  assert.deepEqual(later.data.data.publicationMarkers, [{ at: history[1], type: "update" }]);
  assert.ok(!/PRIVATE|workingContent|editorNote|browserId|password/.test(JSON.stringify(data)));
  assert.equal(data.articleId, String(articles[0]._id));
  const zero = await request(http.baseUrl, analyticsPath(articles[64]._id), { cookie: editorCookie });
  assert.equal(zero.data.data.totalViews, 0);
  assert.deepEqual(zero.data.data.series, []);
  const draft = await request(http.baseUrl, analyticsPath(hidden._id), { cookie: editorCookie });
  assert.equal(draft.status, 200);
  assert.deepEqual(draft.data.data.publicationMarkers, []);
});

test("analytics is Editor-only at route and service, rejects bad ranges/IDs and missing articles", async () => {
  assert.equal((await request(http.baseUrl, analyticsPath())).status, 401);
  assert.equal((await request(http.baseUrl, analyticsPath(), { cookie: reporterCookie })).status, 403);
  await assert.rejects(getAnalytics(users.reporter, String(articles[0]._id), {}), { status: 403 });
  for (const query of ["from=bad", "from=2026-01-01", "to=2026-01-01T00:01:00.000Z",
    "from=2026-01-03T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
    "from=2025-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z", "interval=day", "role=editor"]) {
    assert.equal((await request(http.baseUrl, analyticsPath() + "?" + query, { cookie: editorCookie })).status, 400);
  }
  assert.equal((await request(http.baseUrl, analyticsPath("bad"), { cookie: editorCookie })).status, 400);
  assert.equal((await request(http.baseUrl, analyticsPath(new mongoose.Types.ObjectId()), { cookie: editorCookie })).status, 404);
});

test("existing ViewStat indexes cover article/time and browser/article checks", async () => {
  const byArticle = await ViewStat.find({ article: articles[0]._id, bucketStart: { $gte: new Date("2026-01-01") } })
    .hint({ article: 1, bucketStart: 1 }).explain("executionStats");
  assert.equal(byArticle.executionStats.nReturned, 3);
  const byBrowser = await ViewStat.find({ article: articles[0]._id, browserId: browserA }).limit(1)
    .hint({ browserId: 1, article: 1 }).explain("executionStats");
  assert.equal(byBrowser.executionStats.nReturned, 1);
  assert.ok(byBrowser.executionStats.totalKeysExamined <= 1);
});

test("real popularity/viewed lookup stages use ViewStat indexes", async (t) => {
  const original = Article.aggregate.bind(Article);
  let pipeline;
  t.mock.method(Article, "aggregate", (stages) => { pipeline = stages; return original(stages); });
  const result = await request(http.baseUrl, `/api/articles?sort=popularity&viewed=true&browserId=${browserA}`);
  assert.equal(result.status, 200);
  const explanation = await original(pipeline).explain("executionStats");
  const lookups = explanation.stages.filter((stage) => stage.$lookup);
  assert.equal(lookups.length, 2);
  assert.ok(lookups.every((stage) => stage.indexesUsed.length > 0 && stage.collectionScans === 0));
});
