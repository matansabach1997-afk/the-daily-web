const app = require("../app");
const { openDatabase, closeDatabase, startHttp, stopHttp } = require("../tests/helpers");

async function run() {
  let database, http;
  try {
    database = await openDatabase("smoke");
    http = await startHttp(app);
    const { baseUrl } = http;
    const checks = [
      { path: "/", status: 200, contentType: "text/html" },
      { path: "/health", status: 200, contentType: "application/json" },
      { path: "/api/articles", status: 200, contentType: "application/json" },
      { path: "/missing", status: 404, contentType: "text/html" },
      { path: "/api/missing", status: 404, contentType: "application/json" },
      { path: "/css/style.css", status: 200, contentType: "text/css" },
    ];

    for (const check of checks) {
      const response = await fetch(`${baseUrl}${check.path}`);
      const contentType = response.headers.get("content-type") || "";

      if (response.status !== check.status || !contentType.includes(check.contentType)) {
        throw new Error(
          `${check.path}: expected ${check.status} ${check.contentType}, received ${response.status} ${contentType}`
        );
      }

      console.log(`PASS ${check.path} -> ${response.status}`);
    }
  } finally {
    await stopHttp(http?.server);
    await closeDatabase(database);
  }
}

run().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exitCode = 1;
});
