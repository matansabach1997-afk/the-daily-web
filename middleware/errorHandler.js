function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const message = status === 500 ? "Internal server error" : error.message;

  if (res.headersSent) {
    return next(error);
  }

  if (req.originalUrl.startsWith("/api/")) {
    return res.status(status).json({ error: message });
  }

  return res.status(status).render(status === 404 ? "404" : "error", {
    title: status === 404 ? "Page not found" : "Something went wrong",
    status,
    message,
  });
}

module.exports = errorHandler;
