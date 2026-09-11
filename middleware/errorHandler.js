const log = require("../utils/logger");

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status = Number.isInteger(error.status) ? error.status : 500;
  let code = typeof error.code === "string" ? error.code : "INTERNAL_ERROR";
  let message = error.message;
  let fields = error.fields;
  if (error.type === "entity.parse.failed") {
    status = 400; code = "INVALID_JSON"; message = "The request body is not valid JSON.";
  } else if (error.type === "entity.too.large") {
    status = 413; code = "BODY_TOO_LARGE"; message = "The request body is too large.";
  } else if (error.code === 11000) {
    status = 409; code = "DUPLICATE_RESOURCE"; message = "A resource with that unique value already exists.";
  } else if (error.name === "ValidationError") {
    status = 422; code = "VALIDATION_FAILED"; message = "Please check the submitted fields.";
    fields = Object.fromEntries(Object.keys(error.errors).map((key) => [key, "Invalid value."]));
  } else if (error.name === "CastError") {
    status = 400; code = "INVALID_INPUT"; message = "Invalid resource identifier or value.";
  } else if (["MongoServerSelectionError", "MongooseServerSelectionError", "MongoNetworkError", "MongoNotConnectedError"].includes(error.name)) {
    status = 503; code = "DATABASE_UNAVAILABLE"; message = "The database is temporarily unavailable.";
  }
  if (status < 400 || status > 599) status = 500;
  if (status === 500) {
    code = "INTERNAL_ERROR"; message = "Internal server error"; fields = undefined;
  }
  log(status >= 500 ? "error" : "warn", "request.failed", { requestId: req.requestId, status, code });

  if (req.path === "/api" || req.path.startsWith("/api/")) {
    return res.status(status).json({
      error: { code, message, ...(fields ? { fields } : {}) },
      requestId: req.requestId,
    });
  }

  return res.status(status).render(status === 404 ? "404" : "error", {
    title: status === 404 ? "Page not found" : "Something went wrong",
    status,
    message,
  });
}

module.exports = errorHandler;
