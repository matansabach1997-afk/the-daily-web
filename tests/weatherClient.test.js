const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = readFileSync(path.join(__dirname, "../public/js/weather.js"), "utf8");

function browser() {
  const nodes = Object.fromEntries(["home-weather", "weather-status", "weather-details", "weather-summary", "weather-meta", "weather-time", "weather-retry"].map((id) => [id, {
    dataset: { city: "Tel Aviv" }, attributes: {}, listeners: {}, textContent: "",
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
  }]));
  const requests = [], timers = new Map(), events = {};
  let now = Date.parse("2026-10-03T12:00:00.000Z"), timerId = 0;
  class Clock extends Date { static now() { return now; } }
  const document = { hidden: false, getElementById: (id) => nodes[id], addEventListener(name, fn) { events[name] = fn; } };
  vm.runInNewContext(source, {
    document, window: { addEventListener(name, fn) { events[name] = fn; } },
    Date: Clock, URLSearchParams, AbortController,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("Timeout")));
        requests.push({ url, options, resolve, reject });
      });
    },
  });
  return {
    nodes, requests, timers, events, document,
    advance(ms) { now += ms; },
    retry() { nodes["weather-retry"].listeners.click(); },
    async reply(index, weather = {}, ok = true) {
      requests[index].resolve({ ok, json: async () => ({ weather: {
        city: "Tel Aviv", temperature: 27.4, humidity: 60, windSpeed: 3.5,
        description: "clear sky", fetchedAt: new Date(now).toISOString(), ...weather,
      } }) });
      await new Promise(setImmediate);
    },
  };
}

test("weather calls only Express, renders units/timestamp as text, and has no identity/key requirement", async () => {
  const client = browser();
  assert.equal(client.requests[0].url, "/api/weather?city=Tel+Aviv");
  assert.equal(client.requests[0].options.credentials, "omit");
  assert.equal(client.requests[0].options.cache, "no-store");
  assert.match(client.nodes["weather-status"].textContent, /Loading/);
  await client.reply(0, { description: "<script>not HTML</script>" });
  assert.match(client.nodes["weather-summary"].textContent, /27 °C/);
  assert.ok(client.nodes["weather-summary"].textContent.includes("<script>not HTML</script>"));
  assert.equal(client.nodes["weather-meta"].textContent, "Humidity 60% · Wind 3.5 m/s");
  assert.equal(client.nodes["weather-time"].dateTime, "2026-10-03T12:00:00.000Z");
  assert.equal(client.nodes["weather-details"].hidden, false);
  assert.equal(client.nodes["home-weather"].attributes["aria-busy"], "false");
  assert.ok([...client.timers.values()].some((timer) => timer.delay === 15 * 60000));
});

test("HTTP/network/malformed data errors show a friendly fallback and manual retry, not a retry loop", async () => {
  const client = browser();
  await client.reply(0, {}, false);
  assert.match(client.nodes["weather-status"].textContent, /keep reading the news/);
  assert.equal(client.nodes["weather-details"].hidden, true);
  assert.equal(client.nodes["weather-retry"].hidden, false);
  assert.equal(client.timers.size, 0);
  client.retry();
  client.retry();
  assert.equal(client.requests.length, 2);
  client.requests[1].reject(new Error("Provider URL with sensitive details"));
  await new Promise(setImmediate);
  assert.ok(!client.nodes["weather-status"].textContent.includes("sensitive"));
  client.retry();
  await client.reply(2, { temperature: "bad" });
  assert.equal(client.nodes["weather-details"].hidden, true);
  client.retry();
  await client.reply(3);
  assert.equal(client.nodes["weather-details"].hidden, false);
});

test("an eight-second timeout ends loading without touching the news feed", async () => {
  const client = browser();
  [...client.timers.values()].find((timer) => timer.delay === 8000).fn();
  await new Promise(setImmediate);
  assert.equal(client.requests[0].options.signal.aborted, true);
  assert.equal(client.nodes["weather-retry"].hidden, false);
  assert.equal(client.nodes["home-weather"].attributes["aria-busy"], "false");
});

test("cached data refreshes at its remaining lifetime and stale data is hidden on failure", async () => {
  const client = browser();
  await client.reply(0, { fetchedAt: "2026-10-03T11:46:00.000Z" });
  const refresh = [...client.timers.values()].find((timer) => timer.delay === 60000);
  assert.ok(refresh);
  client.advance(60000);
  refresh.fn();
  assert.equal(client.nodes["weather-details"].hidden, true);
  await client.reply(1, {}, false);
  assert.equal(client.nodes["weather-details"].hidden, true);
  client.retry();
  await client.reply(2, { fetchedAt: "2026-10-03T11:46:00.000Z" });
  assert.equal(client.nodes["weather-details"].hidden, true);
});

test("returning from a suspended tab or page cache checks freshness", async () => {
  for (const event of ["visibilitychange", "pageshow"]) {
    const client = browser();
    await client.reply(0);
    client.advance(16 * 60000);
    client.events[event]();
    assert.equal(client.requests.length, 2);
    assert.equal(client.nodes["weather-details"].hidden, true);
    await client.reply(1);
  }
});
