const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// A small DOM/fetch double runs the real browser script without an extra package.
// These are behavior tests, not a substitute for visual browser checks.
function browser({ infiniteScroll = true, getBrowserId = () => "12345678-1234-4123-8123-123456789abc", blockedStorage = false } = {}) {
  function element(tag = "div") {
    return {
      tag, children: [], listeners: {}, dataset: {}, attributes: {}, value: "", textContent: "",
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      emit(name) { this.listeners[name]({ preventDefault() {} }); },
    };
  }
  const ids = ["feed-filters", "feed-search", "feed-category", "feed-sort", "feed-viewed", "feed-identity-status", "feed-results", "feed-status", "feed-more", "feed-sentinel"];
  const nodes = Object.fromEntries(ids.map((id) => [id, element()]));
  nodes["feed-sort"].value = "newest";
  const requests = [], timers = new Map();
  let timerId = 0, observer;
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() { this.observing = true; }
    unobserve() { this.observing = false; }
    approachBottom() { if (this.observing) this.callback([{ isIntersecting: true }]); }
  }
  const window = infiniteScroll ? { IntersectionObserver: Observer } : {};
  window.DailyWebBrowserIdentity = { getBrowserId };
  const context = {
    document: { getElementById: (id) => nodes[id], createElement: element },
    window, IntersectionObserver: Observer, URLSearchParams, AbortController,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  };
  if (blockedStorage) {
    window.localStorage = { getItem() { throw new Error("Storage blocked"); } };
    window.crypto = { randomUUID: getBrowserId };
    vm.runInNewContext(readFileSync(path.join(__dirname, "../public/js/browser-identity.js"), "utf8"), context);
  }
  vm.runInNewContext(readFileSync(path.join(__dirname, "../public/js/feed.js"), "utf8"), context);
  return {
    nodes, requests, observer,
    runDebounce() { for (const fn of timers.values()) fn(); timers.clear(); },
    async reply(index, data, nextCursor = null, status = 200) {
      requests[index].resolve({ ok: status === 200, json: async () => status === 200 ?
        { data, meta: { nextCursor, hasMore: nextCursor !== null } } : { error: { message: "Service unavailable" } } });
      await new Promise(setImmediate);
    },
  };
}

function article(id) {
  return { _id: String(id), title: "<script>plain text</script>", summary: "News summary", category: "science",
    reporter: { username: "Reporter" }, publishedAt: "2026-01-01T00:00:00.000Z", imageUrl: "" };
}

test("feed requests first batch, serializes infinite scroll, deduplicates and stops at end", async () => {
  const client = browser();
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0].url, "/api/articles?sort=newest");
  assert.equal(client.nodes["feed-results"].attributes["aria-busy"], "true");
  await client.reply(0, Array.from({ length: 20 }, (_, i) => article(i)), "page-two");
  assert.equal(client.nodes["feed-results"].children.length, 20);
  client.observer.approachBottom();
  client.observer.approachBottom();
  assert.equal(client.requests.length, 2);
  assert.ok(client.requests[1].url.includes("cursor=page-two"));
  await client.reply(1, [article(19), article(20)]);
  assert.equal(client.nodes["feed-results"].children.length, 21);
  assert.equal(client.nodes["feed-more"].hidden, true);
  assert.match(client.nodes["feed-status"].textContent, /End of results/);
  client.observer.approachBottom();
  assert.equal(client.requests.length, 2);
  const link = client.nodes["feed-results"].children[0].children[0].children[1].children[0];
  assert.equal(link.href, "/articles/0");
  assert.equal(link.textContent, "<script>plain text</script>");
});

test("changing filters aborts old requests and ignores late results before/after debounce", async () => {
  const client = browser();
  client.nodes["feed-search"].value = "telescope";
  client.nodes["feed-search"].emit("input");
  assert.equal(client.requests[0].options.signal.aborted, true);
  await client.reply(0, [article("stale")]);
  assert.equal(client.nodes["feed-results"].children.length, 0);
  client.runDebounce();
  assert.ok(client.requests[1].url.includes("q=telescope"));
  client.nodes["feed-category"].value = "science";
  client.nodes["feed-category"].emit("change");
  client.nodes["feed-sort"].value = "oldest";
  client.nodes["feed-sort"].emit("change");
  client.runDebounce();
  assert.equal(client.requests.length, 3);
  assert.equal(client.requests[2].url, "/api/articles?sort=oldest&q=telescope&category=science");
  await client.reply(2, [article("latest")], "filtered-next");
  await client.reply(1, [article("stale")]);
  assert.deepEqual(client.nodes["feed-results"].children.map((node) => node.dataset.articleId), ["latest"]);
  client.observer.approachBottom();
  assert.ok(client.requests[3].url.includes("q=telescope&category=science&cursor=filtered-next"));
  await client.reply(3, []);
});

test("network/API failures keep cards and retry the same cursor without an automatic loop", async () => {
  const client = browser();
  await client.reply(0, [article(1)], "next");
  client.observer.approachBottom();
  await client.reply(1, [], null, 503);
  assert.equal(client.nodes["feed-results"].children.length, 1);
  assert.equal(client.nodes["feed-more"].textContent, "Try again");
  assert.equal(client.nodes["feed-more"].disabled, false);
  client.observer.approachBottom();
  assert.equal(client.requests.length, 2);
  client.nodes["feed-more"].emit("click");
  assert.equal(client.requests[2].url, client.requests[1].url);
  client.requests[2].reject(new Error("Network offline"));
  await new Promise(setImmediate);
  assert.match(client.nodes["feed-status"].textContent, /Network offline/);
  client.nodes["feed-more"].emit("click");
  await client.reply(3, [article(2)]);
  assert.equal(client.nodes["feed-results"].children.length, 2);
});

test("load-more fallback works without IntersectionObserver and empty results are explicit", async () => {
  const client = browser({ infiniteScroll: false });
  await client.reply(0, [article(1)], "next");
  client.nodes["feed-more"].emit("click");
  await client.reply(1, [article(2)]);
  assert.equal(client.nodes["feed-results"].children.length, 2);
  client.nodes["feed-filters"].emit("submit");
  client.runDebounce();
  assert.ok(!client.requests[2].url.includes("cursor="));
  await client.reply(2, []);
  assert.match(client.nodes["feed-status"].textContent, /No articles match/);
  assert.equal(client.nodes["feed-more"].hidden, true);
});

test("popularity and viewed filters compose with search/category and reset page cursors", async () => {
  const client = browser();
  await client.reply(0, [article(1)], "old-cursor");
  client.nodes["feed-search"].value = "telescope";
  client.nodes["feed-category"].value = "science";
  client.nodes["feed-sort"].value = "popularity";
  client.nodes["feed-sort"].emit("change");
  client.runDebounce();
  let params = new URL(client.requests[1].url, "http://local").searchParams;
  assert.equal(params.get("sort"), "popularity");
  assert.equal(params.get("q"), "telescope");
  assert.equal(params.get("category"), "science");
  assert.equal(params.has("cursor"), false);
  assert.equal(params.has("browserId"), false);
  await client.reply(1, [article(2)], "popular-next");
  for (const [index, viewed] of [[2, "true"], [3, "false"], [4, ""]]) {
    client.nodes["feed-viewed"].value = viewed;
    client.nodes["feed-viewed"].emit("change");
    client.runDebounce();
    params = new URL(client.requests[index].url, "http://local").searchParams;
    assert.equal(params.get("viewed"), viewed || null);
    assert.equal(params.get("browserId"), viewed ? "12345678-1234-4123-8123-123456789abc" : null);
    assert.equal(params.has("cursor"), false);
    assert.equal(params.get("sort"), "popularity");
    assert.equal(params.get("q"), "telescope");
    assert.equal(params.get("category"), "science");
    assert.equal(client.nodes["feed-results"].children.length, 0);
    await client.reply(index, [article(index)], "next");
  }
});

test("identity failure falls back to All; a document-only identity still permits filtering", async () => {
  for (const getBrowserId of [() => null, () => { throw new Error("Identity unavailable"); }]) {
    const client = browser({ getBrowserId });
    await client.reply(0, []);
    client.nodes["feed-viewed"].value = "true";
    client.nodes["feed-viewed"].emit("change");
    client.runDebounce();
    assert.equal(client.nodes["feed-viewed"].value, "");
    assert.ok(!client.requests[1].url.includes("viewed="));
    assert.match(client.nodes["feed-identity-status"].textContent, /Showing All/);
    await client.reply(1, [article(1)]);
    assert.equal(client.nodes["feed-results"].children.length, 1);
  }
  const client = browser({ blockedStorage: true }); // Runs the actual helper's in-memory fallback.
  client.nodes["feed-viewed"].value = "false";
  client.nodes["feed-viewed"].emit("change");
  client.runDebounce();
  await client.reply(1, [article(1)], "next");
  client.nodes["feed-more"].emit("click");
  const params = new URL(client.requests[2].url, "http://local").searchParams;
  assert.equal(params.get("viewed"), "false");
  assert.equal(params.get("cursor"), "next");
  assert.equal(params.get("browserId"), "12345678-1234-4123-8123-123456789abc");
});

test("identity changes never mix an old viewed cursor with a new browser ID", async () => {
  let identity = "12345678-1234-4123-8123-123456789abc";
  const client = browser({ getBrowserId: () => identity });
  client.nodes["feed-viewed"].value = "true";
  client.nodes["feed-viewed"].emit("change");
  client.runDebounce();
  await client.reply(1, [article(1)], "old-identity-cursor");
  identity = "12345678-1234-4123-8123-123456789def";
  client.nodes["feed-more"].emit("click");
  client.runDebounce();
  const params = new URL(client.requests[2].url, "http://local").searchParams;
  assert.equal(params.has("cursor"), false);
  assert.equal(params.get("browserId"), identity);
  assert.equal(client.nodes["feed-results"].children.length, 0);
});
