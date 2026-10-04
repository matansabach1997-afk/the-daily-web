const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const weatherService = require("../services/weatherService");
const { startHttp, stopHttp } = require("./helpers");
const realFetch = global.fetch;
const originalKey = process.env.OPENWEATHER_API_KEY;
let http;
before(async () => { http = await startHttp(app); });
after(async () => { await stopHttp(http?.server); });
afterEach(() => {
  global.fetch = realFetch;
  if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
  else process.env.OPENWEATHER_API_KEY = originalKey;
  weatherService.clearWeatherCache();
});

test("home contains a small independent weather area and serves its script without secrets", async () => {
  process.env.OPENWEATHER_API_KEY = "test-secret-not-for-html";
  const html = await (await realFetch(http.baseUrl + "/")).text();
  assert.match(html, /id="home-weather"/);
  assert.match(html, /class="news-layout">\s*<aside id="home-weather"/);
  assert.match(html, /<\/aside>\s*<div class="news-main">\s*<form id="feed-filters"/);
  assert.match(html, /data-city="Tel Aviv"/);
  assert.match(html, /id="feed-results"/);
  assert.match(html, /src="\/js\/weather.js" defer/);
  assert.ok(!html.includes(process.env.OPENWEATHER_API_KEY));
  const script = await realFetch(http.baseUrl + "/js/weather.js");
  assert.equal(script.status, 200);
  const source = await script.text();
  assert.ok(!source.includes("api.openweathermap.org"));
  assert.ok(!source.includes("OPENWEATHER_API_KEY"));
  const css = await (await realFetch(http.baseUrl + "/css/feed.css")).text();
  assert.match(css, /\.news-layout \{ display: flex;/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.news-layout \{ flex-direction: column;/);
});

test("existing Express weather route returns its exact envelope and keeps server caching", async () => {
  process.env.OPENWEATHER_API_KEY = "test-only-key";
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.ok(url.startsWith("https://api.openweathermap.org/"));
    return { ok: true, json: async () => ({ name: "Tel Aviv", main: { temp: 27, humidity: 60 }, weather: [{ description: "clear sky" }], wind: { speed: 3.5 } }) };
  };
  for (let index = 0; index < 2; index++) {
    const response = await realFetch(http.baseUrl + "/api/weather?city=Tel%20Aviv");
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload), ["weather"]);
    assert.equal(payload.weather.temperature, 27);
    assert.equal(payload.weather.windSpeed, 3.5);
    assert.ok(!JSON.stringify(payload).includes("test-only-key"));
  }
  assert.equal(calls, 1);
});

test("missing weather configuration gives 503 but home and health remain usable", async () => {
  delete process.env.OPENWEATHER_API_KEY;
  global.fetch = async () => { throw new Error("Provider must not be called without a key"); };
  assert.equal((await realFetch(http.baseUrl + "/api/weather?city=Tel%20Aviv")).status, 503);
  assert.equal((await realFetch(http.baseUrl + "/api/weather")).status, 400);
  assert.equal((await realFetch(http.baseUrl + "/")).status, 200);
  assert.equal((await realFetch(http.baseUrl + "/health")).status, 200);
});
