// Only explicitly approved metadata is logged. Never pass request bodies or secrets.
function log(level, event, details = {}) {
  const entry = { timestamp: new Date().toISOString(), level, event };
  for (const key of ["requestId", "status", "code", "userId", "articleId", "port"]) {
    if (details[key] !== undefined) entry[key] = String(details[key]).slice(0, 120);
  }
  const write = level === "error" ? console.error : console.log;
  write(JSON.stringify(entry));
}

module.exports = log;
