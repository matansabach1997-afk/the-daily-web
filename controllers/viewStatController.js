const { recordView } = require("../services/viewStatService");
const { allowedFields } = require("../utils/validation");

async function record(req, res) {
  allowedFields(req.query, [], "query");
  await recordView(req.body);
  res.status(204).end();
}

module.exports = { record };
