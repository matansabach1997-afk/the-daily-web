const httpError = require("../utils/httpError");

function notFound(req, res, next) {
  next(httpError(404, "NOT_FOUND", "The requested resource was not found."));
}

module.exports = notFound;
