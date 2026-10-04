const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const Article = require("../models/Article");
const Comment = require("../models/Comment");
const ViewStat = require("../models/ViewStat");
const workflow = require("../services/articleWorkflowService");
const comments = require("../services/commentService");
const views = require("../services/viewStatService");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login, content } = require("./fixtures");
let database, http, users, cookies;
const browserId = "12345678-1234-4234-8234-123456789abc";
before(async () => {
  database = await openDatabase("cleanup");
  await ViewStat.createIndexes();
  users = await accounts();
  http = await startHttp(app);
  cookies = { editor: await login(http.baseUrl, users.editor), reporter: await login(http.baseUrl, users.reporter) };
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

async function fixture() {
  const article = await Article.create({ reporter: users.reporter._id, workingContent: content, publishedContent: content, publishedAt: new Date(), status: "published" });
  await Comment.create({ article: article._id, author: users.reporter._id, body: "Comment" });
  await views.recordView({ articleId: String(article._id), browserId });
  return article;
}

test("only Editor DELETE removes an article's Comments and ViewStats, leaving other articles untouched", async () => {
  const target = await fixture(), other = await fixture();
  const path = `/api/articles/${target._id}`;
  for (const [role, status] of [["guest", 401], ["reporter", 403]]) {
    assert.equal((await request(http.baseUrl, path, { method: "DELETE", cookie: cookies[role] })).status, status);
    assert.equal(await ViewStat.countDocuments({ article: target._id }), 1);
    assert.equal(await Comment.countDocuments({ article: target._id }), 1);
  }
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await request(http.baseUrl, path, { method: "DELETE", cookie: cookies.editor })).status, 204);
  assert.equal(await Article.exists({ _id: target._id }), null);
  assert.equal(await ViewStat.countDocuments({ article: target._id }), 0);
  assert.equal(await Comment.countDocuments({ article: target._id }), 0);
  assert.equal(await ViewStat.countDocuments({ article: other._id }), 1);
  assert.equal(await Comment.countDocuments({ article: other._id }), 1);
});

test("retrying deletion repairs dependent cleanup after a partial database failure", async (t) => {
  const article = await fixture();
  const mock = t.mock.method(Comment, "deleteMany", () => ({ maxTimeMS: async () => { throw new Error("Temporary failure"); } }));
  await assert.rejects(workflow.deleteArticle(users.editor, String(article._id)), /Temporary failure/);
  assert.equal(await Article.exists({ _id: article._id }), null);
  assert.equal(await ViewStat.countDocuments({ article: article._id }), 1);
  mock.mock.restore();
  await workflow.deleteArticle(users.editor, String(article._id));
  assert.equal(await Comment.countDocuments({ article: article._id }), 0);
  assert.equal(await ViewStat.countDocuments({ article: article._id }), 0);
});

test("an admitted comment cannot leave an orphan when the article is deleted before insertion", async (t) => {
  const article = await fixture();
  const create = Comment.create.bind(Comment);
  t.mock.method(Comment, "create", async (...args) => {
    await workflow.deleteArticle(users.editor, String(article._id));
    return create(...args);
  });
  await assert.rejects(comments.createComment(users.reporter, { articleId: String(article._id), body: "Late comment" }), { status: 404 });
  assert.equal(await Comment.countDocuments({ article: article._id }), 0);
});

test("an admitted view cannot recreate a bucket after article deletion", async (t) => {
  const article = await fixture();
  const update = ViewStat.updateOne.bind(ViewStat);
  t.mock.method(ViewStat, "updateOne", (...args) => ({ maxTimeMS: async (ms) => {
    await workflow.deleteArticle(users.editor, String(article._id));
    return update(...args).maxTimeMS(ms);
  } }));
  await assert.rejects(views.recordView({ articleId: String(article._id), browserId }), { status: 404 });
  assert.equal(await ViewStat.countDocuments({ article: article._id }), 0);
});
