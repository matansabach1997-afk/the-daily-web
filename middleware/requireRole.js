const httpError = require("../utils/httpError");

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, "AUTHENTICATION_REQUIRED", "Please log in."));
    if (!roles.includes(req.user.role)) return next(httpError(403, "FORBIDDEN", "Your role cannot perform this action."));
    next();
  };
}

module.exports = requireRole;
