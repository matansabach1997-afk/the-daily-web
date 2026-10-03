const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const articleId = "0123456789abcdef01234567";
const browserId = "12345678-1234-4123-8123-123456789abc";
function browser(identity = browserId) {
  function element() {
    return {
      children: [], listeners: {}, attributes: {}, dataset: {}, value: "", textContent: "",
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      emit(name) { this.listeners[name]({ preventDefault() {} }); },
    };
  }
  const nodes = Object.fromEntries(["comment-form", "comments-list", "comments-status", "comments-reload", "comment-body", "comment-submit", "comment-feedback"].map((id) => [id, element()]));
  const requests = [], tracking = [];
  vm.runInNewContext(readFileSync(path.join(__dirname, "../public/js/article.js"), "utf8"), {
    document: {
      getElementById: (id) => nodes[id], createElement: element,
      querySelector: () => ({ dataset: { publicArticleId: articleId } }),
    },
    window: { DailyWebBrowserIdentity: { getBrowserId: () => identity } },
    URLSearchParams, AbortController,
    fetch(url, options) {
      if (url === "/api/view-stats") { tracking.push({ url, options }); return Promise.reject(new Error("Tracking offline")); }
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  });
  return {
    nodes, requests, tracking,
    async reply(index, data, code = 200) {
      requests[index].resolve({ ok: code < 400, json: async () => code < 400 ? { data } : { error: data } });
      await new Promise(setImmediate);
    },
    submit(text) { nodes["comment-body"].value = text; nodes["comment-form"].emit("submit"); },
  };
}
function comment(id = "a", body = "<script>plain text</script>") {
  return { _id: id, article: articleId, body, author: null, createdAt: "2026-10-01T12:00:00.000Z" };
}

test("article loads comments independently of failed tracking, using text rather than HTML", async () => {
  const client = browser();
  assert.equal(client.tracking.length, 1);
  assert.equal(client.requests[0].url, `/api/comments?articleId=${articleId}`);
  await client.reply(0, [comment()]);
  assert.equal(client.nodes["comments-list"].children[0].children[1].textContent, "<script>plain text</script>");
  assert.match(client.nodes["comments-status"].textContent, /1 comments/);
  assert.equal(client.nodes["comment-submit"].disabled, false);
});

test("AJAX guest submit uses the existing ID, prevents double-clicks and immediately shows the result", async () => {
  const client = browser();
  await client.reply(0, []);
  assert.match(client.nodes["comments-status"].textContent, /No comments/);
  client.submit("  Hello  ");
  client.nodes["comment-form"].emit("submit");
  assert.equal(client.requests.length, 2);
  assert.equal(client.requests[1].url, "/api/comments");
  assert.equal(client.requests[1].options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(client.requests[1].options.body), { articleId, browserId, body: "Hello" });
  await client.reply(1, comment("new", "Hello"), 201);
  assert.equal(client.nodes["comments-list"].children[0].children[1].textContent, "Hello");
  assert.equal(client.nodes["comment-body"].value, "");
  assert.equal(client.nodes["comment-feedback"].textContent, "Comment posted.");
  await client.reply(2, [comment("new", "Hello")]);
  assert.equal(client.nodes["comments-list"].children.length, 1);
});

test("late initial list cannot erase a just-posted comment and the refreshed list recovers older ones", async () => {
  const client = browser();
  client.submit("New");
  await client.reply(1, comment("new", "New"), 201);
  assert.equal(client.requests[0].options.signal.aborted, true);
  await client.reply(0, []);
  assert.equal(client.nodes["comments-list"].children.length, 1);
  await client.reply(2, [comment("new", "New"), comment("old", "Older")]);
  assert.equal(client.nodes["comments-list"].children.length, 2);
});

test("rate-limit/validation/network errors keep the draft and permit manual retry only", async () => {
  const client = browser();
  await client.reply(0, []);
  client.submit(" ");
  assert.equal(client.requests.length, 1);
  assert.match(client.nodes["comment-feedback"].textContent, /1–2000/);
  client.submit("Keep me");
  await client.reply(1, { code: "COMMENT_RATE_LIMIT", message: "Maximum 3 guest comments per minute." }, 429);
  assert.match(client.nodes["comment-feedback"].textContent, /Maximum 3/);
  assert.equal(client.nodes["comment-body"].value, "Keep me");
  assert.equal(client.nodes["comment-submit"].disabled, false);
  client.submit("Keep me");
  await client.reply(2, { message: "Check fields", fields: { body: "Too long" } }, 422);
  assert.match(client.nodes["comment-feedback"].textContent, /Too long/);
  client.submit("Keep me");
  client.requests[3].reject(new Error("Offline"));
  await new Promise(setImmediate);
  assert.match(client.nodes["comment-feedback"].textContent, /Offline/);
  assert.equal(client.requests.length, 4);
});

test("missing identity does not block authenticated POST or public reading; server errors are explained", async () => {
  const client = browser(null);
  await client.reply(0, { message: "Database unavailable" }, 503);
  assert.match(client.nodes["comments-status"].textContent, /Refresh comments/);
  client.nodes["comments-reload"].emit("click");
  await client.reply(1, []);
  client.submit("Authenticated without identity");
  assert.equal("browserId" in JSON.parse(client.requests[2].options.body), false);
  await client.reply(2, comment(), 201);
  await client.reply(3, [comment()]);
  client.submit("Guest without identity");
  await client.reply(4, { code: "INVALID_BROWSER_ID", message: "ID required" }, 400);
  assert.match(client.nodes["comment-feedback"].textContent, /Guest posting needs/);
});
