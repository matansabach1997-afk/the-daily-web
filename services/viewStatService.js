const ViewStat = require("../models/ViewStat");
const Article = require("../models/Article");
const mongoose = require("mongoose");
const requireActor = require("../utils/authorization");
const { requirePublicArticle } = require("./articleQueryService");
const { allowedFields, id, browserId } = require("../utils/validation");
const httpError = require("../utils/httpError");

function hourStart(now) {
  return new Date(Math.floor(now.getTime() / 3600000) * 3600000);
}

async function recordView(input) {
  allowedFields(input, ["articleId", "browserId"]);
  const articleId = id(input.articleId);
  const identity = browserId(input.browserId);
  await requirePublicArticle(articleId);
  const now = new Date();
  const filter = { article: articleId, browserId: identity, bucketStart: hourStart(now) };
  const update = { $inc: { views: 1 }, $max: { lastViewedAt: now } };
  try {
    await ViewStat.updateOne(filter, update, { upsert: true, runValidators: true }).maxTimeMS(5000);
  } catch (error) {
    // Concurrent first visits may race to insert the same unique bucket.
    // The losing insert did not increment; retry once against the winning row.
    if (error.code !== 11000) throw error;
    const result = await ViewStat.updateOne(filter, update, { runValidators: true }).maxTimeMS(5000);
    if (result.matchedCount !== 1) throw error;
  }
  // A request admitted before hard deletion must not recreate an orphan bucket.
  if (!await Article.exists({ _id: articleId })) {
    await ViewStat.deleteMany(filter).maxTimeMS(5000);
    throw httpError(404, "ARTICLE_NOT_FOUND", "Article not found.");
  }
}

function analyticsPeriod(query) {
  allowedFields(query, ["from", "to"], "query");
  function boundary(value) {
    const date = typeof value === "string" ? new Date(value) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value || date.getTime() % 3600000 !== 0) {
      throw httpError(400, "INVALID_PERIOD", "Use UTC ISO timestamps on hour boundaries, including milliseconds.");
    }
    return date;
  }
  const to = query.to === undefined ? new Date(hourStart(new Date()).getTime() + 3600000) : boundary(query.to);
  const from = query.from === undefined ? new Date(to.getTime() - 30 * 86400000) : boundary(query.from);
  if (!Number.isFinite(from.getTime()) || from >= to || to - from > 90 * 86400000) {
    throw httpError(400, "INVALID_PERIOD", "The analytics period must be positive and at most 90 days.");
  }
  return { from, to };
}

async function getAnalytics(actor, articleId, query) {
  requireActor(actor, ["editor"]);
  const key = new mongoose.Types.ObjectId(id(articleId));
  const { from, to } = analyticsPeriod(query);
  // Editor may inspect any existing article, but no editable content is returned.
  const article = await Article.findById(key).select("_id publishedAt publicationHistory").lean();
  if (!article) throw httpError(404, "ARTICLE_NOT_FOUND", "Article not found.");
  const [result] = await ViewStat.aggregate([
    { $match: { article: key } },
    { $facet: {
      total: [{ $group: { _id: null, views: { $sum: "$views" } } }],
      series: [
        { $match: { bucketStart: { $gte: from, $lt: to } } },
        { $group: { _id: "$bucketStart", views: { $sum: "$views" } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, bucketStart: "$_id", views: 1 } },
      ],
    } },
  ]).option({ maxTimeMS: 5000 });
  const series = result.series;
  return {
    articleId: article._id,
    publishedAt: article.publishedAt,
    totalViews: result.total[0]?.views || 0,
    period: { from, to, interval: "hour" },
    periodViews: series.reduce((sum, point) => sum + point.views, 0),
    series,
    publicationMarkers: article.publicationHistory
      .map((at, index) => ({ at, type: index === 0 ? "publication" : "update" }))
      .filter((marker) => marker.at >= from && marker.at < to),
  };
}

module.exports = { recordView, hourStart, getAnalytics };
