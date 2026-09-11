const { randomUUID } = require("node:crypto");

function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.path === "/api" || req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}

module.exports = requestContext;
