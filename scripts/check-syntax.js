const { readdirSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
let count = 0;
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".codex"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) check(target);
    else if (entry.name.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", target], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${target}\n${result.stderr}`);
      count += 1;
    }
  }
}
check(root);
console.log(`PASS syntax: ${count} JavaScript files`);
