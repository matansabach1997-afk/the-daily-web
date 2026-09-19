const { recordView, getAnalytics } = require("../services/viewStatService");
const { allowedFields } = require("../utils/validation");

async function record(req, res) {
  allowedFields(req.query, [], "query");
  await recordView(req.body);
  res.status(204).end();
}

async function analytics(req, res) {
  res.json({ data: await getAnalytics(req.user, req.params.id, req.query) });
}

module.exports = { record, analytics };
