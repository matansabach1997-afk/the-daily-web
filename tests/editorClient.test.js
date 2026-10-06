const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const settle = () => new Promise(setImmediate);
const content = { title: "Submitted", summary: "Summary", body: "Body", category: "science", imageUrl: "https://example.com/image.jpg" };
const article = { _id: "0123456789abcdef01234567", workingContent: content, publishedContent: { ...content, title: "Public title" }, publishedAt: "2026-01-01T00:00:00.000Z", status: "pending", reporter: { username: "reporter" }, editorNote: "" };

function browser(script) {
  const nodes = {};
  function element() {
    return {
      value: "", textContent: "", dataset: {}, children: [], listeners: {}, hidden: false, disabled: false,
      addEventListener(name, fn) { this.listeners[name] = fn; },
      emit(name) { return this.listeners[name]?.({ preventDefault() {} }); },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
    };
  }
  const document = {
    getElementById(id) { return nodes[id] ||= element(); },
    createElement: element,
    querySelector() { return { dataset: { articleId: article._id } }; },
  };
  document.getElementById("status-filter").value = "pending";
  const requests = [];
  const window = { confirm: () => true };
  vm.runInNewContext(readFileSync(path.join(__dirname, `../public/js/editor/${script}.js`), "utf8"), {
    document, window, URLSearchParams,
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
  });
  return {
    nodes, requests, window,
    async reply(index, data, status = 200, meta) {
      requests[index].resolve({ status, ok: status < 400, json: async () => status < 400 ? { data, meta } : { error: data } });
      await settle();
    },
  };
}

test("Queue filters reset pagination, ignore stale results and deduplicate safe cards", async () => {
  const client = browser("index");
  assert.match(client.requests[0].url, /status=pending/);
  client.nodes["status-filter"].value = "returned";
  client.nodes["status-filter"].emit("change");
  await client.reply(0, [article], 200, { hasMore: false, nextCursor: null });
  assert.equal(client.nodes["article-list"].children.length, 0);
  await client.reply(1, [{ ...article, workingContent: { ...content, title: "<script>unsafe</script>" } }], 200, { hasMore: true, nextCursor: "opaque cursor" });
  assert.equal(client.nodes["article-list"].children[0].children[0].textContent, "<script>unsafe</script>");
  client.nodes["load-more-button"].emit("click");
  assert.match(client.requests[2].url, /status=returned&cursor=opaque\+cursor/);
  await client.reply(2, [article], 200, { hasMore: false, nextCursor: null });
  assert.equal(client.nodes["article-list"].children.length, 1);
  client.nodes["status-filter"].value = "";
  client.nodes["status-filter"].emit("change");
  assert.equal(client.requests[3].url, "/api/workspace/articles?");
  await client.reply(3, [], 200, { hasMore: false, nextCursor: null });
  assert.equal(client.nodes["empty-message"].hidden, false);
});

test("Approval saves edits first, prevents duplicate actions and updates the public comparison", async () => {
  const client = browser("review");
  await client.reply(0, article);
  assert.equal(client.nodes["published-content"].children[1].textContent, "Public title");
  client.nodes["article-title"].value = "Edited";
  client.nodes["approve-button"].emit("click");
  client.nodes["approve-button"].emit("click");
  assert.equal(client.requests.length, 2);
  assert.equal(client.requests[1].options.method, "PATCH");
  const edited = JSON.parse(client.requests[1].options.body).workingContent;
  await client.reply(1, { ...article, workingContent: edited });
  assert.match(client.requests[2].url, /\/approvals$/);
  await client.reply(2, { ...article, status: "published", workingContent: edited, publishedContent: edited });
  assert.equal(client.nodes["published-content"].children[1].textContent, "Edited");
  assert.equal(client.nodes["approve-button"].hidden, true);
});

test("Failed save prevents approval and preserves unsaved text and field errors", async () => {
  const client = browser("review");
  await client.reply(0, article);
  client.nodes["article-title"].value = "Keep this edit";
  client.nodes["approve-button"].emit("click");
  await client.reply(1, { message: "Invalid image", fields: { imageUrl: "Use HTTPS" } }, 422);
  assert.equal(client.requests.length, 2);
  assert.equal(client.nodes["article-title"].value, "Keep this edit");
  assert.equal(client.nodes["field-errors"].children[0].textContent, "imageUrl: Use HTTPS");
  assert.equal(client.nodes["approve-button"].disabled, false);
});

test("Return sends a required note and renders returned status", async () => {
  const client = browser("review");
  await client.reply(0, article);
  client.nodes["return-form"].emit("submit");
  assert.equal(client.requests.length, 1);
  client.nodes["editor-note"].value = "  Explain sources  ";
  client.nodes["return-form"].emit("submit");
  await settle();
  assert.equal(JSON.parse(client.requests[1].options.body).editorNote, "Explain sources");
  await client.reply(1, { ...article, status: "returned", editorNote: "Explain sources" });
  assert.equal(client.nodes["article-status"].textContent, "returned");
  assert.equal(client.nodes["return-form"].hidden, true);
});

test("Delete requires confirmation, retries failures and handles 204 without parsing JSON", async () => {
  const client = browser("review");
  await client.reply(0, article);
  client.window.confirm = () => false;
  client.nodes["delete-button"].emit("click");
  assert.equal(client.requests.length, 1);
  client.window.confirm = () => true;
  client.nodes["delete-button"].emit("click");
  await client.reply(1, { message: "Database unavailable" }, 503);
  assert.equal(client.nodes["delete-button"].disabled, false);
  client.nodes["delete-button"].emit("click");
  assert.equal(client.requests[2].options.method, "DELETE");
  await client.reply(2, null, 204);
  assert.equal(client.nodes["review-content"].hidden, true);
  assert.match(client.nodes["review-feedback"].textContent, /Article deleted/);
});

test("State conflicts keep edits and require reload before further actions", async () => {
  const client = browser("review");
  await client.reply(0, article);
  client.nodes["article-title"].value = "Unsaved";
  client.nodes["approve-button"].emit("click");
  await client.reply(1, { message: "State changed" }, 409);
  assert.equal(client.nodes["article-title"].value, "Unsaved");
  assert.equal(client.nodes["approve-button"].disabled, true);
  assert.equal(client.nodes["reload-button"].disabled, false);
  assert.match(client.nodes["review-feedback"].textContent, /Reload/);
});
