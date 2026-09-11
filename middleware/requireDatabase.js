const mongoose = require("mongoose");
const httpError = require("../utils/httpError");

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return next(httpError(503, "DATABASE_UNAVAILABLE", "The database is temporarily unavailable."));
  }
  next();
}

module.exports = requireDatabase;
