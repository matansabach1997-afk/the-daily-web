const test = require("node:test");
const assert = require("node:assert/strict");

const {
  makeContent,
  ARTICLE_COUNT,
  SEED_PREFIX,
  run,
  seedId,
} = require("../scripts/seed-articles");

const { categories } = require("../config/articleRules");
const Article = require("../models/Article");
const User = require("../models/User");
const Comment = require("../models/Comment");
const ViewStat = require("../models/ViewStat");
const { openDatabase, closeDatabase } = require("./helpers");
const { validateContent } = require("../services/articleWorkflowService");
const { verifyPassword } = require("../services/passwordService");
const { getAnalytics } = require("../services/viewStatService");

test("seed is configured to generate at least 500 articles", () => {
  assert.ok(ARTICLE_COUNT >= 500);
});

test("seed content matches the Article content structure", () => {
  const content = makeContent(0, "technology");

  assert.equal(typeof content.title, "string");
  assert.equal(typeof content.summary, "string");
  assert.equal(typeof content.body, "string");
  assert.equal(content.category, "technology");
  assert.equal(typeof content.imageUrl, "string");
});

test("seed supports every configured article category", () => {
  for (const category of categories) {
    const content = makeContent(1, category);

    assert.equal(content.category, category);
  }
});

test("seeded articles use an identifiable seed prefix", () => {
  const content = makeContent(0, "science");

  assert.ok(content.title.startsWith(SEED_PREFIX));
});

test("generated content varies between articles", () => {
  const first = makeContent(0, "technology");
  const second = makeContent(1, "science");

  assert.notEqual(first.title, second.title);
  assert.notEqual(first.body, second.body);
  assert.notEqual(first.category, second.category);
});

test("real demo seed is complete, repeatable and preserves unrelated data in an isolated database", async () => {
  let database;
  const oldPassword = process.env.SEED_PASSWORD;
  try {
    database = await openDatabase("seed");
    process.env.SEED_PASSWORD = "Test-only-demo-password-123";
    const collision = await User.create({ username: "demo_editor", role: "reporter", passwordHash: "unchanged" });
    await assert.rejects(run(database.name), /Seed account collision/);
    assert.equal(await User.countDocuments(), 1);
    assert.equal((await User.findById(collision._id).select("+passwordHash")).passwordHash, "unchanged");
    assert.equal(await Article.countDocuments(), 0);
    await User.deleteOne({ _id: collision._id });
    const unrelatedUser = await User.create({ username: "unrelated", role: "reporter", passwordHash: "test fixture" });
    const unrelatedArticle = await Article.create({ reporter: unrelatedUser._id, workingContent: makeContent(900, "science") });
    const unrelatedComment = await Comment.create({ article: unrelatedArticle._id, author: unrelatedUser._id, body: "Keep me" });
    const unrelatedStat = await ViewStat.create({ article: unrelatedArticle._id, browserId: "12345678-1234-4234-8234-123456789abc", bucketStart: new Date(0), lastViewedAt: new Date(0), views: 1 });

    await assert.rejects(run("wrong-database"), /Seed refused/);
    assert.equal(await Article.countDocuments(), 1);
    const result = await run(database.name);
    assert.equal(result.articles, 500);
    assert.equal(result.comments, 256);
    assert.ok(result.viewStats > 6000);
    const articles = await Article.find({ _id: { $ne: unrelatedArticle._id } }).lean();
    assert.equal(articles.length, 500);
    for (const status of ["draft", "pending", "returned", "published"]) assert.equal(articles.filter((article) => article.status === status).length, 125);
    assert.equal(new Set(articles.map((article) => article.workingContent.category)).size, categories.length);
    assert.ok(articles.some((article) => article.status === "draft" && article.workingContent.body === ""));
    assert.equal(await User.countDocuments({ role: "editor" }), 1);
    assert.equal(await User.countDocuments({ role: "reporter", _id: { $ne: unrelatedUser._id } }), 3);
    const editor = await User.findById(seedId(1, 3)).select("+passwordHash");
    assert.equal(await verifyPassword(process.env.SEED_PASSWORD, editor.passwordHash), true);
    for (const article of articles) {
      if (["pending", "published"].includes(article.status)) validateContent(article.workingContent, { complete: true });
      if (article.publishedContent) {
        validateContent(article.publishedContent, { complete: true });
        assert.equal(+article.publishedAt, +article.publicationHistory[0]);
        assert.ok(article.publicationHistory.every((at) => at <= new Date()));
      }
    }
    const updated = articles.find((article) => article.status === "published" && article.publicationHistory.length === 3);
    const graph = await getAnalytics(editor, String(updated._id), {});
    assert.equal(graph.publicationMarkers.length, 3);
    assert.ok(graph.series.length >= 144);
    assert.ok(graph.series[0].views < graph.series.at(-1).views);
    assert.ok(graph.series.some((point) => point.bucketStart < updated.publicationHistory[1]));
    assert.ok(graph.series.some((point) => point.bucketStart > updated.publicationHistory[2]));

    // A second run repairs a partially removed demo while preserving credentials/IDs.
    await Article.deleteOne({ _id: seedId(2, 3) });
    process.env.SEED_PASSWORD = "A-different-valid-test-password";
    const again = await run(database.name);
    assert.deepEqual(again, result);
    assert.equal(await Article.countDocuments(), 501);
    assert.equal(await Comment.countDocuments(), result.comments + 1);
    assert.equal(await ViewStat.countDocuments(), result.viewStats + 1);
    assert.equal(await User.countDocuments(), 5);
    assert.equal((await User.findById(editor._id).select("+passwordHash")).passwordHash, editor.passwordHash);
    assert.ok(await Comment.exists({ _id: unrelatedComment._id }));
    assert.ok(await ViewStat.exists({ _id: unrelatedStat._id }));
    for (const model of [Comment, ViewStat]) {
      const orphans = await model.aggregate([
        { $lookup: { from: "articles", localField: "article", foreignField: "_id", as: "parent" } },
        { $match: { parent: { $size: 0 } } }, { $count: "count" },
      ]);
      assert.deepEqual(orphans, []);
    }
  } finally {
    if (oldPassword === undefined) delete process.env.SEED_PASSWORD;
    else process.env.SEED_PASSWORD = oldPassword;
    await closeDatabase(database);
  }
});

