const ViewStat = require("../models/ViewStat");
const { requirePublicArticle } = require("./articleQueryService");
const { allowedFields, id } = require("../utils/validation");
const httpError = require("../utils/httpError");

function hourStart(now) {
  return new Date(Math.floor(now.getTime() / 3600000) * 3600000);
}

async function recordView(input) {
  allowedFields(input, ["articleId", "browserId"]);
  const articleId = id(input.articleId);
  if (typeof input.browserId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.browserId)) {
    throw httpError(400, "INVALID_BROWSER_ID", "A valid anonymous browser UUID is required.");
  }
  await requirePublicArticle(articleId);
  const now = new Date();
  const filter = { article: articleId, browserId: input.browserId.toLowerCase(), bucketStart: hourStart(now) };
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
}

module.exports = { recordView, hourStart };
