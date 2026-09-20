const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function browser() {
  function element(tag = "div") {
    return {
      tag, children: [], attributes: {}, listeners: {}, value: "", textContent: "", clientWidth: 320,
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      emit(name) { this.listeners[name]({ preventDefault() {} }); },
    };
  }
  const ids = ["search-form", "search", "articles", "list-status", "more", "selected", "range", "refresh", "status", "report", "chart", "markers", "total", "period-total", "period", "data"];
  const nodes = Object.fromEntries(ids.map((id) => ["analytics-" + id, element()]));
  nodes["analytics-range"].value = "30";
  const requests = [], listeners = {};
  vm.runInNewContext(readFileSync(path.join(__dirname, "../public/js/analytics.js"), "utf8"), {
    document: { getElementById: (id) => nodes[id], createElement: element, createElementNS: (_, tag) => element(tag) },
    window: { addEventListener(name, fn) { listeners[name] = fn; } },
    AbortController, URLSearchParams,
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
  });
  return {
    nodes, requests, listeners,
    async reply(index, payload, code = 200) {
      requests[index].resolve({ ok: code === 200, json: async () => payload });
      await new Promise(setImmediate);
    },
    select(index = 0) { nodes["analytics-articles"].children[index].children[0].emit("click"); },
  };
}
const article = { _id: "0123456789abcdef01234567", title: "<script>Safe title</script>" };
const batch = (data, cursor = null) => ({ data, meta: { nextCursor: cursor, hasMore: cursor !== null } });
function analytics({ series = [], markers = [] } = {}) {
  return { data: {
    articleId: article._id, publishedAt: "2026-01-01T00:00:00.000Z", totalViews: 8,
    periodViews: series.reduce((sum, point) => sum + point.views, 0),
    period: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z", interval: "hour" },
    series, publicationMarkers: markers,
  } };
}

test("article picker uses public API paging/search, ignores stale pages and deduplicates", async () => {
  const client = browser();
  assert.equal(client.requests[0].url, "/api/articles?sort=newest");
  await client.reply(0, batch([article], "next"));
  assert.equal(client.nodes["analytics-articles"].children[0].children[0].textContent, article.title);
  client.nodes["analytics-more"].emit("click");
  assert.match(client.requests[1].url, /cursor=next/);
  await client.reply(1, batch([article]));
  assert.equal(client.nodes["analytics-articles"].children.length, 1);
  client.nodes["analytics-search"].value = "telescope";
  client.nodes["analytics-search-form"].emit("submit");
  assert.equal(client.requests[2].url, "/api/articles?sort=newest&q=telescope");
  client.nodes["analytics-search"].value = "latest";
  client.nodes["analytics-search-form"].emit("submit");
  assert.equal(client.requests[2].options.signal.aborted, true);
  await client.reply(2, batch([article]));
  assert.equal(client.nodes["analytics-articles"].children.length, 0);
  await client.reply(3, batch([]));
  assert.match(client.nodes["analytics-list-status"].textContent, /No public articles/);
  assert.equal(client.nodes["analytics-more"].hidden, true);
});

test("selected article and 7/30/90 day UTC-hour ranges use existing endpoint without stale results", async () => {
  const client = browser();
  await client.reply(0, batch([article]));
  client.select();
  for (const [index, days] of [[1, 30], [2, 7], [3, 90]]) {
    if (index > 1) {
      client.nodes["analytics-range"].value = String(days);
      client.nodes["analytics-range"].emit("change");
      assert.equal(client.requests[index - 1].options.signal.aborted, true);
    }
    const url = new URL(client.requests[index].url, "http://local");
    assert.equal(url.pathname, `/api/view-stats/articles/${article._id}/analytics`);
    const from = new Date(url.searchParams.get("from")), to = new Date(url.searchParams.get("to"));
    assert.equal(to - from, days * 86400000);
    assert.equal(to.getTime() % 3600000, 0);
    assert.equal(from.getTime() % 3600000, 0);
    assert.equal(client.requests[index].options.credentials, "same-origin");
  }
  await client.reply(3, analytics());
  await client.reply(1, { data: { totalViews: 999 } });
  assert.equal(client.nodes["analytics-total"].textContent, "8");
  assert.match(client.nodes["analytics-selected"].textContent, /Safe title/);
  assert.equal(client.nodes["analytics-refresh"].disabled, false);
});

test("empty/zero chart is finite and responsive; markers come only from returned events", async () => {
  const client = browser();
  await client.reply(0, batch([article]));
  client.select();
  await client.reply(1, analytics());
  assert.match(client.nodes["analytics-status"].textContent, /No recorded views/);
  let svg = client.nodes["analytics-chart"].children[0];
  let line = svg.children.find((node) => node.tag === "polyline");
  assert.equal(line.attributes.points.split(" ").length, 24);
  assert.ok(!/NaN|Infinity/.test(line.attributes.points));
  assert.equal(svg.children.filter((node) => node.attributes.class?.startsWith("analytics-marker")).length, 0);
  // Even publishedAt does not create a marker absent from publicationMarkers.
  assert.match(client.nodes["analytics-markers"].children[0].textContent, /No publication/);
  client.nodes["analytics-refresh"].emit("click");
  const markers = [{ at: "2026-01-01T00:30:00.000Z", type: "publication" }, { at: "2026-01-01T12:15:00.000Z", type: "update" }];
  await client.reply(2, analytics({ series: [{ bucketStart: "2026-01-01T01:00:00.000Z", views: 1 }], markers }));
  svg = client.nodes["analytics-chart"].children[0];
  assert.equal(svg.children.filter((node) => node.attributes.class?.startsWith("analytics-marker")).length, 2);
  assert.equal(client.nodes["analytics-markers"].children.length, 2);
  assert.match(client.nodes["analytics-markers"].children[1].textContent, /Approved update: 2026-01-01 12:15:00.000 UTC/);
  assert.equal(client.nodes["analytics-data"].children.length, 1);
  for (const width of [280, 688, 880]) {
    client.nodes["analytics-chart"].clientWidth = width;
    client.listeners.resize();
    assert.equal(client.nodes["analytics-chart"].children[0].attributes.viewBox, `0 0 ${width} 300`);
  }
});

test("list and analytics API/network errors are visible and retryable; stale report is hidden", async () => {
  const client = browser();
  await client.reply(0, { error: { message: "Database unavailable" } }, 503);
  assert.match(client.nodes["analytics-list-status"].textContent, /Database unavailable/);
  client.nodes["analytics-more"].emit("click");
  await client.reply(1, batch([article]));
  client.select();
  await client.reply(2, analytics());
  client.nodes["analytics-refresh"].emit("click");
  assert.equal(client.nodes["analytics-report"].hidden, true);
  await client.reply(3, { error: { message: "Please log in." } }, 401);
  assert.match(client.nodes["analytics-status"].textContent, /Please log in/);
  assert.equal(client.nodes["analytics-report"].hidden, true);
  client.nodes["analytics-refresh"].emit("click");
  client.requests[4].reject(new Error("Network offline"));
  await new Promise(setImmediate);
  assert.match(client.nodes["analytics-status"].textContent, /Network offline/);
  assert.equal(client.nodes["analytics-refresh"].disabled, false);
});
