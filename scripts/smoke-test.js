const app = require("../app");

async function run() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
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
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

run().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exitCode = 1;
});
