const mongoose = require("mongoose");
const Article = require("../models/Article");
const User = require("../models/User");
const Comment = require("../models/Comment");
const ViewStat = require("../models/ViewStat");
// Compile User before the connection module disables command buffering.
const connectDatabase = require("../config/database");
const { categories } = require("../config/articleRules");
const { hashPassword, validatePassword } = require("../services/passwordService");
const { validateContent } = require("../services/articleWorkflowService");

const ARTICLE_COUNT = 500;
const SEED_PREFIX = "[SEED-D]";
const HOUR = 3600000;

// Reserved, deterministic IDs make reruns replace only this script's demo records.
function seedId(kind, index) {
  return new mongoose.Types.ObjectId("d41e" + kind + "0".repeat(11) + index.toString(16).padStart(8, "0"));
}

function makeContent(index, category) {
  return {
    title: `${SEED_PREFIX} ${category} article ${index + 1}`,
    summary: `Demo summary for seeded ${category} article ${index + 1}.`,
    body: `This is demo content for article ${index + 1}. It belongs to the ${category} category and was generated for project testing.`,
    category,
    imageUrl: "/images/demo-news.svg",
  };
}

async function run(target = process.argv[2]) {
  // The argument must name the actual local database, not just say "development".
  let uri;
  try { uri = new URL(process.env.MONGODB_URI); } catch { throw new Error("Set a local MONGODB_URI before seeding."); }
  if (process.env.NODE_ENV === "production" || uri.protocol !== "mongodb:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname) ||
      !target || uri.pathname !== `/${target}` || ["admin", "local", "config"].includes(target)) {
    throw new Error("Seed refused: explicitly pass the exact local development/demo database name; production is not allowed.");
  }
  validatePassword(process.env.SEED_PASSWORD);
  await connectDatabase();

  const users = ["demo_reporter_1", "demo_reporter_2", "demo_reporter_3", "demo_editor"].map((username, index) => ({
    _id: seedId(1, index), username, role: index === 3 ? "editor" : "reporter",
  }));
  const articleIds = Array.from({ length: ARTICLE_COUNT }, (_, index) => seedId(2, index));

  // Check reserved-name/ID collisions BEFORE changing data. Existing passwords stay intact.
  const existingUsers = await User.find({ $or: [{ _id: { $in: users.map((user) => user._id) } }, { username: { $in: users.map((user) => user.username) } }] }).lean();
  for (const existing of existingUsers) {
    if (!users.some((user) => String(user._id) === String(existing._id) && user.username === existing.username && user.role === existing.role)) {
      throw new Error("Seed account collision: reserved demo accounts do not match. No records changed.");
    }
  }
  const existingArticles = await Article.find({ _id: { $in: articleIds } }).select("reporter workingContent.title").lean();
  for (const article of existingArticles) {
    if (!users.slice(0, 3).some((user) => String(user._id) === String(article.reporter)) || !article.workingContent.title.startsWith(SEED_PREFIX)) {
      throw new Error("Seed article collision: reserved demo IDs contain other content. No records changed.");
    }
  }
  for (const model of [User, Article, Comment, ViewStat]) await model.createIndexes();
  for (const user of users) {
    if (!existingUsers.some((existing) => String(existing._id) === String(user._id))) {
      await User.create({ ...user, passwordHash: await hashPassword(process.env.SEED_PASSWORD) });
    }
  }

  const now = Math.floor(Date.now() / HOUR) * HOUR;
  const articles = [], comments = [], stats = [];
  for (let index = 0; index < ARTICLE_COUNT; index++) {
    const status = ["draft", "pending", "returned", "published"][index % 4];
    const content = makeContent(index, categories[index % categories.length]);
    validateContent(content, { complete: true });
    const publicVersion = status === "published" || index < 3;
    const first = new Date(now - (168 - index % 24) * HOUR);
    const history = publicVersion ? [first] : [];
    if (publicVersion && (index % 12 === 3 || index < 3)) history.push(new Date(+first + 48 * HOUR), new Date(+first + 96 * HOUR));
    const workingContent = { ...content };
    if (index < 3) workingContent.title += " - private revision";
    if (status === "draft" && index >= 4) workingContent.body = ""; // Persistable incomplete work.
    articles.push({
      _id: articleIds[index], reporter: users[index % 3]._id, workingContent,
      publishedContent: publicVersion ? { ...content } : null, status,
      editorNote: status === "returned" ? "Please add more detail before resubmitting." : "",
      publishedAt: publicVersion ? first : null, publicationHistory: history,
    });
    if (!publicVersion) continue;
    comments.push(
      { article: articleIds[index], author: users[index % 3]._id, body: "Demo reader: thank you for this report." },
      { article: articleIds[index], browserId: "d41e0000-0000-4000-8000-000000000001", body: "Demo guest: an interesting update." }
    );
    // Updated stories have hourly points before/after both markers; others daily.
    const interval = history.length > 1 ? HOUR : 24 * HOUR;
    for (let at = +first; at < now; at += interval) {
      const elapsed = (at - first) / HOUR;
      stats.push({
        article: articleIds[index], browserId: "d41e0000-0000-4000-8000-000000000002",
        bucketStart: new Date(at), lastViewedAt: new Date(at + 30 * 60000),
        views: (elapsed < 48 ? 5 : elapsed < 96 ? 15 : 30) + index % 5,
      });
    }
  }

  // No global deletes, no transactions. A stopped run is repaired by rerunning.
  // Use an idle demo database: dependent comments/views on these demo IDs are reset.
  await Comment.deleteMany({ article: { $in: articleIds } }).maxTimeMS(10000);
  await ViewStat.deleteMany({ article: { $in: articleIds } }).maxTimeMS(10000);
  await Article.bulkWrite(articles.map((article) => ({ replaceOne: { filter: { _id: article._id }, replacement: article, upsert: true } })));
  await Comment.insertMany(comments);
  for (let offset = 0; offset < stats.length; offset += 500) await ViewStat.insertMany(stats.slice(offset, offset + 500));
  const result = { articles: articles.length, comments: comments.length, viewStats: stats.length, demoUsers: users.length };
  console.log(`Seed complete: ${JSON.stringify(result)}. Existing demo passwords were preserved.`);
  return result;
}

if (require.main === module) {
  run().catch(() => {
    // Do not print driver errors that might contain credentials or password hashes.
    console.error("Seed failed. Check the exact local target, SEED_PASSWORD (12-128 characters), MongoDB and reserved demo IDs. See README.");
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}

module.exports = { run, makeContent, ARTICLE_COUNT, SEED_PREFIX, seedId };
