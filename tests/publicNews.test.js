const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const app = require("../app");
const Article = require("../models/Article");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, content } = require("./fixtures");
let database, http, articles, hidden, reporter;
const approvedBody = "First approved paragraph.\n\n" + "Complete approved article content. ".repeat(100) +
  '\n<script>alert("not executable")</script>\nLast approved paragraph.';

before(async () => {
  database = await openDatabase("news");
  ({ reporter } = await accounts());
  articles = await Article.insertMany(Array.from({ length: 45 }, (_, index) => ({
    reporter: reporter._id,
    workingContent: { ...content, title: "ConfidentialUnapproved", category: "culture", body: "PRIVATE_BODY" },
    publishedContent: {
      ...content, title: `Public telescope discovery ${index}`, body: approvedBody,
      category: index < 25 ? "science" : "sport",
    },
    status: ["published", "draft", "pending", "returned"][index % 4],
    publishedAt: new Date(Date.UTC(2026, 0, 1 + Math.floor(index / 3))),
    publicationHistory: [new Date()], editorNote: "PRIVATE_NOTE",
  })));
  hidden = await Article.create({ reporter: reporter._id, workingContent: { ...content, title: "telescope unpublished" } });
  http = await startHttp(app);
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

async function allPages(params) {
  let cursor, rows = [], sizes = [];
  do {
    const query = new URLSearchParams(params);
    if (cursor) query.set("cursor", cursor);
    const response = await request(http.baseUrl, `/api/articles?${query}`);
    assert.equal(response.status, 200);
    const { data, meta } = response.data;
    sizes.push(data.length);
    rows.push(...data);
    assert.equal(meta.hasMore, meta.nextCursor !== null);
    cursor = meta.nextCursor;
    assert.ok(sizes.length < 10, "Pagination must end");
  } while (cursor);
  assert.equal(new Set(rows.map((article) => article._id)).size, rows.length);
  return { rows, sizes };
}

test("public title search, category and both date orders combine across 20-item pages", async () => {
  for (const sort of ["newest", "oldest"]) {
    const { rows, sizes } = await allPages({ q: "TELESCOPE", category: "science", sort });
    const direction = sort === "oldest" ? 1 : -1;
    const expected = articles.slice(0, 25).sort((a, b) => direction *
      (a.publishedAt - b.publishedAt || String(a._id).localeCompare(String(b._id))));
    assert.deepEqual(sizes, [20, 5]);
    assert.deepEqual(rows.map((row) => row._id), expected.map((row) => String(row._id)));
    assert.ok(rows.every((row) => row.category === "science"));
    assert.ok(!JSON.stringify(rows).includes("PRIVATE"));
  }
  assert.deepEqual((await allPages({ sort: "oldest" })).sizes, [20, 20, 5]);
  assert.equal((await allPages({ q: '"telescope discovery"' })).rows.length, 45);
});

test("search/filter never use working fields or unpublished titles; no matches return empty page", async () => {
  for (const params of [{ q: "ConfidentialUnapproved" }, { category: "culture" }, { q: "unpublished" }, { q: "telesc" }, { q: "zzznomatch" }]) {
    const result = await allPages(params);
    assert.deepEqual(result.sizes, [0]);
  }
  const result = await allPages({ category: "sport" });
  assert.deepEqual(result.sizes, [20]);
  assert.equal((await allPages({ q: "   " })).rows.length, 45);
});

test("title text index supports Hebrew words without English stemming", async () => {
  const article = await Article.create({
    reporter: reporter._id, workingContent: content,
    publishedContent: { ...content, title: "חדשות מדע בישראל" },
    publishedAt: new Date(), status: "published",
  });
  try {
    const result = await allPages({ q: "מדע" });
    assert.deepEqual(result.rows.map((row) => row._id), [String(article._id)]);
  } finally { await Article.deleteOne({ _id: article._id }); }
});

test("feed rejects unsupported, repeated and oversized filters without crashing", async () => {
  for (const [query, status] of [
    ["category=invalid", 400], ["category=science&category=sport", 400],
    ["sort=popular", 400], ["sort=oldest&sort=newest", 400],
    ["q=one&q=two", 400], ["q[$ne]=secret", 400], ["q=" + "a".repeat(101), 422],
  ]) {
    const response = await request(http.baseUrl, "/api/articles?" + query);
    assert.equal(response.status, status, query);
    assert.ok(response.data.error.code);
  }
  assert.equal((await request(http.baseUrl, "/health")).status, 200);
});

test("article HTML contains the entire escaped approved body in every revision state, without browser JS", async () => {
  for (const article of articles.slice(0, 4)) {
    const response = await fetch(`${http.baseUrl}/articles/${article._id}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.ok(html.includes(article.publishedContent.title));
    assert.ok(html.includes(reporter.username));
    assert.ok(html.includes(article.publishedAt.toISOString()));
    assert.ok(html.includes(article.publishedContent.category));
    assert.ok(html.includes('src="https://example.com/image.jpg"'));
    const escaped = approvedBody.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&#34;").replaceAll("'", "&#39;");
    assert.ok(html.includes(escaped), "Full body, not an excerpt, must be in initial HTML");
    assert.ok(!html.includes('<script>alert('));
    assert.ok(!/PRIVATE|ConfidentialUnapproved|workingContent|editorNote|publicationHistory/.test(html));
    assert.match(html, /class="site-footer"/);
  }
});

test("public page uses shared HTML errors for unavailable articles and invalid IDs", async () => {
  for (const [id, expectedStatus] of [[hidden._id, 404], [new mongoose.Types.ObjectId(), 404], ["bad-id", 400]]) {
    const response = await fetch(`${http.baseUrl}/articles/${id}`);
    assert.equal(response.status, expectedStatus);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(await response.text(), /class="site-footer"/);
  }
});

test("public HTML never treats a date without approved content as publication; deleted pages become 404", async () => {
  const article = await Article.create({ reporter: reporter._id, workingContent: content, publishedAt: new Date() });
  try {
    assert.equal((await fetch(`${http.baseUrl}/articles/${article._id}`)).status, 404);
    await Article.updateOne({ _id: article._id }, { $set: { publishedContent: content } });
    assert.equal((await fetch(`${http.baseUrl}/articles/${article._id}`)).status, 200);
    await Article.deleteOne({ _id: article._id });
    assert.equal((await fetch(`${http.baseUrl}/articles/${article._id}`)).status, 404);
  } finally { await Article.deleteOne({ _id: article._id }); }
});

test("homepage serves accessible filter controls and scoped static assets", async () => {
  const html = await (await fetch(http.baseUrl + "/")).text();
  for (const id of ["feed-filters", "feed-search", "feed-category", "feed-sort", "feed-results", "feed-status", "feed-more", "feed-sentinel"]) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /aria-live="polite"/);
  for (const path of ["/js/feed.js", "/css/feed.css", "/css/article.css"]) {
    assert.equal((await fetch(http.baseUrl + path)).status, 200);
  }
});

test("public category and title queries use their declared MongoDB indexes", async () => {
  const indexes = await Article.collection.indexes();
  assert.ok(indexes.some((index) => index.weights?.["publishedContent.title"] === 1 && index.default_language === "none"));
  const categoryPlan = await Article.find({ publishedAt: { $type: "date" }, "publishedContent.category": "science", publishedContent: { $ne: null } })
    .sort({ publishedAt: -1, _id: -1 }).limit(21)
    .hint({ "publishedContent.category": 1, publishedAt: -1, _id: -1 }).explain("executionStats");
  assert.equal(categoryPlan.executionStats.nReturned, 21);
  assert.ok(categoryPlan.executionStats.totalKeysExamined <= 25);
  const searchPlan = await Article.find({ $text: { $search: "telescope" }, publishedAt: { $type: "date" } }).explain("executionStats");
  assert.equal(searchPlan.executionStats.nReturned, 45);
  assert.ok(!JSON.stringify(searchPlan.queryPlanner.winningPlan).includes("COLLSCAN"));
});
