const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const articleId = "0123456789abcdef01234567";
const initialContent = { title: "Original", summary: "Summary", body: "Body", category: "science", imageUrl: "https://example.com/image.jpg" };
const settle = () => new Promise(setImmediate);

// Run the real page script. Control timers and HTTP completion order, not its internals.
async function browser() {
  function element() {
    return {
      value: "", dataset: {}, listeners: {}, children: [], disabled: false, hidden: false,
      addEventListener(name, fn, capture) { this.listeners[name] = { fn, capture }; },
      emit(name, options = {}) {
        const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...options };
        const result = this.listeners[name]?.fn(event);
        return { event, result };
      },
      replaceChildren(...children) { this.children = children; },
      append(child) { this.children.push(child); },
      focus() {},
    };
  }
  const nodes = Object.fromEntries([
    "article-form", "article-status", "save-feedback", "editor-note-panel", "editor-note-text", "field-errors",
    "save-button", "submit-button", "revision-button", "reporter-back-link",
    ...Object.keys(initialContent).map((field) => `article-${field === "imageUrl" ? "image-url" : field}`),
  ].map((id) => [id, element()]));
  nodes["reporter-back-link"].href = "http://localhost/reporter";
  const document = { ...element(), hidden: false, querySelector: () => ({ dataset: { articleId } }), getElementById: (id) => nodes[id], createElement: element };
  const requests = [], navigations = [], timers = new Map();
  let now = 0, nextTimer = 0;
  const window = { ...element(), location: { assign: (url) => navigations.push(url) } };
  vm.runInNewContext(readFileSync(path.join(__dirname, "../public/js/reporter/edit.js"), "utf8"), {
    document, window, TextEncoder,
    setTimeout(fn, delay) { timers.set(++nextTimer, { fn, at: now + delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options = {}) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
  });
  const client = {
    nodes, document, window, requests, navigations, timers,
    edit(title) {
      assert.equal(nodes["article-title"].disabled, false);
      nodes["article-title"].value = title;
      nodes["article-form"].emit("input");
    },
    async tick(ms = 700) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.fn(); }
      }
      await settle();
    },
    async reply(index, data, status = 200) {
      assert.ok(requests[index], `Expected HTTP request ${index}`);
      requests[index].resolve({ ok: status < 400, status, json: async () => status < 400 ? { data } : { error: data } });
      await settle();
    },
    async saved(index, overrides = {}) {
      const sent = JSON.parse(requests[index].options.body).workingContent;
      await this.reply(index, { _id: articleId, status: "draft", editorNote: "", workingContent: sent, ...overrides });
    },
  };
  await client.reply(0, { _id: articleId, status: "draft", editorNote: "", workingContent: { ...initialContent } });
  return client;
}

function titleSent(client, index) { return JSON.parse(client.requests[index].options.body).workingContent.title; }
function submissions(client) { return client.requests.filter((request) => request.url.endsWith("/submissions")); }

test("pagehide flushes pending debounce with keepalive, without duplicate visibility saves", async () => {
  const client = await browser();
  client.edit("Before refresh");
  client.window.emit("pagehide");
  assert.equal(titleSent(client, 1), "Before refresh");
  assert.equal(client.requests[1].options.keepalive, true);
  client.document.hidden = true;
  client.document.emit("visibilitychange");
  client.window.emit("pagehide", { persisted: true });
  await client.tick();
  assert.equal(client.requests.length, 2);
  await client.saved(1);
  assert.equal(client.nodes["save-feedback"].textContent, "Saved");
  assert.equal(client.window.listeners.beforeunload, undefined);
});

test("page exit preserves serialization and the newest pending snapshot while a save is in flight", async () => {
  const client = await browser();
  client.edit("Already saving");
  await client.tick();
  assert.equal(client.requests[1].options.keepalive, true);
  client.edit("Latest before exit");
  client.window.emit("pagehide");
  assert.equal(client.requests.length, 2, "Never race two PATCH requests");
  await client.saved(1); // Continuation is testable while the document is still alive.
  assert.equal(titleSent(client, 2), "Latest before exit");
  assert.equal(client.requests[2].options.keepalive, true);
  await client.saved(2);
});

test("large UTF-8 drafts save intact normally instead of exceeding the keepalive budget", async () => {
  const client = await browser();
  const body = "\u05d0".repeat(40000);
  client.nodes["article-body"].value = body;
  client.edit("Long draft");
  await client.tick();
  assert.equal(client.requests[1].options.keepalive, false);
  assert.equal(JSON.parse(client.requests[1].options.body).workingContent.body, body);
  await client.saved(1);
  client.window.emit("pagehide");
  assert.equal(client.requests.length, 2);
});

test("failed exit flush never submits or reports Saved and can be retried on the page", async () => {
  const client = await browser();
  client.edit("Keep on failure");
  client.window.emit("pagehide");
  await client.reply(1, { message: "Offline" }, 503);
  client.window.emit("pagehide");
  assert.equal(client.requests.length, 2);
  assert.equal(submissions(client).length, 0);
  assert.equal(client.nodes["save-feedback"].dataset.kind, "error");
  client.nodes["save-button"].emit("click");
  await client.saved(2);
});

test("Submit waits for BOTH the in-flight save and the newer pending save", async () => {
  const client = await browser();
  client.edit("First edit");
  await client.tick();
  client.edit("Latest edit");
  client.nodes["submit-button"].emit("click");
  await settle();
  assert.equal(client.requests.length, 2); // GET and first PATCH only.
  await client.saved(1);
  assert.equal(titleSent(client, 2), "Latest edit");
  assert.equal(submissions(client).length, 0, "Second PATCH has not been acknowledged yet");
  assert.equal(client.nodes["article-title"].disabled, true);
  client.nodes["submit-button"].emit("click"); // No duplicate submission.
  await client.saved(2);
  assert.equal(submissions(client).length, 1);
  assert.equal(client.requests[3].options.method, "POST");
  await client.reply(3, { status: "pending", workingContent: { ...initialContent, title: "Latest edit" } });
  assert.equal(client.nodes["article-title"].disabled, true);
});

test("a failed final save prevents submission and preserves editable text for explicit retry", async () => {
  const client = await browser();
  client.edit("First");
  await client.tick();
  client.edit("Keep latest");
  client.nodes["submit-button"].emit("click");
  await client.saved(1);
  await client.reply(2, { message: "Check content", fields: { title: "Invalid title" } }, 422);
  await client.tick(5000);
  assert.equal(submissions(client).length, 0);
  assert.equal(client.requests.length, 3);
  assert.equal(client.nodes["article-title"].value, "Keep latest");
  assert.equal(client.nodes["article-title"].disabled, false);
  assert.equal(client.nodes["save-feedback"].dataset.kind, "error");
  assert.equal(client.nodes["field-errors"].children[0].textContent, "title: Invalid title");
  client.nodes["submit-button"].emit("click");
  assert.equal(titleSent(client, 3), "Keep latest");
  await client.saved(3);
  assert.equal(submissions(client).length, 1);
});

test("failure of an earlier in-flight save also stops the queue and submission", async () => {
  const client = await browser();
  client.edit("First");
  await client.tick();
  client.edit("Latest");
  client.nodes["submit-button"].emit("click");
  client.requests[1].reject(new Error("Offline"));
  await settle();
  await client.tick(5000);
  assert.equal(client.requests.length, 2);
  assert.equal(submissions(client).length, 0);
  assert.equal(client.nodes["article-title"].value, "Latest");
  assert.equal(client.nodes["article-title"].disabled, false);
});

test("normal autosave retains its 700ms debounce and avoids unchanged duplicate saves", async () => {
  const client = await browser();
  client.edit("Changed");
  await client.tick(699);
  assert.equal(client.requests.length, 1);
  await client.tick(1);
  assert.equal(titleSent(client, 1), "Changed");
  await client.saved(1);
  assert.equal(client.nodes["save-feedback"].textContent, "Saved");
  client.nodes["save-button"].emit("click");
  await settle();
  assert.equal(client.requests.length, 2);
});

test("rapid edits coalesce to the latest snapshot without concurrent PATCH requests", async () => {
  const client = await browser();
  client.edit("First");
  await client.tick();
  client.edit("Superseded");
  client.edit("Newest");
  await client.tick();
  assert.equal(client.requests.length, 2);
  await client.saved(1);
  assert.equal(titleSent(client, 2), "Newest");
  client.edit("Newest again");
  await client.tick();
  assert.equal(client.requests.length, 3);
  await client.saved(2);
  assert.equal(titleSent(client, 3), "Newest again");
  await client.saved(3);
  await client.tick(5000);
  assert.equal(client.requests.length, 4);
  assert.equal(client.nodes["article-title"].value, "Newest again");
  assert.equal(client.nodes["save-feedback"].textContent, "Saved");
});

test("reverting to the original content still saves after an older in-flight change", async () => {
  const client = await browser();
  client.edit("Temporary");
  await client.tick();
  client.edit(initialContent.title);
  client.nodes["submit-button"].emit("click");
  await client.saved(1);
  assert.equal(titleSent(client, 2), initialContent.title);
  assert.equal(submissions(client).length, 0);
  await client.saved(2);
  assert.equal(submissions(client).length, 1);
});

test("server normalization of an acknowledged snapshot does not cause duplicate saves", async () => {
  const client = await browser();
  client.edit("  Trimmed by server  ");
  await client.tick();
  await client.saved(1, { workingContent: { ...initialContent, title: "Trimmed by server" } });
  client.nodes["submit-button"].emit("click");
  await settle();
  assert.equal(client.requests.length, 3);
  assert.equal(submissions(client).length, 1);
});

test("leaving an input flushes the pending debounce without duplicating an in-flight save", async () => {
  const client = await browser();
  client.edit("Blur save");
  assert.equal(client.nodes["article-form"].listeners.blur.capture, true);
  client.nodes["article-form"].emit("blur");
  assert.equal(titleSent(client, 1), "Blur save");
  client.nodes["article-form"].emit("blur");
  await client.tick();
  assert.equal(client.requests.length, 2);
  await client.saved(1);
});

test("hiding the document flushes pending edits early, with no unload handler or automatic failure retry", async () => {
  const client = await browser();
  client.edit("Tab change");
  client.document.emit("visibilitychange");
  assert.equal(client.requests.length, 1);
  client.document.hidden = true;
  client.document.emit("visibilitychange");
  assert.equal(titleSent(client, 1), "Tab change");
  await client.reply(1, { message: "Unavailable" }, 503);
  client.document.emit("visibilitychange");
  await client.tick(5000);
  assert.equal(client.requests.length, 2);
  assert.equal(client.document.listeners.beforeunload, undefined);
});

test("Back to Reporter Workspace waits for the whole save queue before navigating", async () => {
  const client = await browser();
  client.edit("First");
  await client.tick();
  client.edit("Before leaving");
  const click = client.nodes["reporter-back-link"].emit("click");
  assert.equal(click.event.defaultPrevented, true);
  assert.deepEqual(client.navigations, []);
  await client.saved(1);
  assert.equal(titleSent(client, 2), "Before leaving");
  assert.deepEqual(client.navigations, []);
  await client.saved(2);
  assert.deepEqual(client.navigations, ["http://localhost/reporter"]);
});

test("failed navigation flush stays on the page; modified link clicks retain native behavior", async () => {
  const client = await browser();
  client.edit("Keep draft");
  assert.equal(client.nodes["reporter-back-link"].emit("click", { ctrlKey: true }).event.defaultPrevented, false);
  assert.equal(client.requests.length, 1);
  client.nodes["reporter-back-link"].emit("click");
  await client.reply(1, { message: "Save failed" }, 503);
  assert.deepEqual(client.navigations, []);
  assert.equal(client.nodes["article-title"].disabled, false);
  assert.equal(client.nodes["article-title"].value, "Keep draft");
  client.nodes["reporter-back-link"].emit("click");
  await client.saved(2);
  assert.deepEqual(client.navigations, ["http://localhost/reporter"]);
});

test("submission validation failure unlocks the form without losing the saved content", async () => {
  const client = await browser();
  client.edit("Saved before submit");
  client.nodes["submit-button"].emit("click");
  await client.saved(1);
  assert.equal(client.nodes["article-title"].disabled, true);
  await client.reply(2, { message: "Complete all fields", fields: { body: "Required" } }, 422);
  assert.equal(client.nodes["article-title"].disabled, false);
  assert.equal(client.nodes["article-title"].value, "Saved before submit");
  assert.equal(client.nodes["save-feedback"].textContent, "Complete all fields");
});

test("expired login during saving retains unsaved text instead of navigating away", async () => {
  const client = await browser();
  client.edit("Unsaved text");
  client.nodes["submit-button"].emit("click");
  await client.reply(1, { message: "Please log in" }, 401);
  assert.equal(submissions(client).length, 0);
  assert.deepEqual(client.navigations, []);
  assert.equal(client.nodes["article-title"].value, "Unsaved text");
  assert.equal(client.nodes["article-title"].disabled, false);
  assert.match(client.nodes["save-feedback"].textContent, /log in/i);
});
