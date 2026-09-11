const httpError = require("../utils/httpError");

function requireAuth(req, res, next) {
  if (!req.user) return next(httpError(401, "AUTHENTICATION_REQUIRED", "Please log in."));
  next();
}

module.exports = requireAuth;
