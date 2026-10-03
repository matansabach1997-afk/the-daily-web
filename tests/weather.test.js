const test = require("node:test");
const assert = require("node:assert/strict");

const weatherService = require("../services/weatherService");
const originalFetch = global.fetch;
const originalKey = process.env.OPENWEATHER_API_KEY;

test.beforeEach(() => {
  weatherService.clearWeatherCache();
  process.env.OPENWEATHER_API_KEY = "test-key";
});

test.afterEach(() => {
  weatherService.clearWeatherCache();
  if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
  else process.env.OPENWEATHER_API_KEY = originalKey;
  global.fetch = originalFetch;
});

test("weather is fetched and returned in the expected format", async () => {
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        name: "Tel Aviv",
        main: {
          temp: 27,
          humidity: 60,
        },
        weather: [
          {
            description: "clear sky",
          },
        ],
        wind: {
          speed: 3.5,
        },
      };
    },
  });

  const result = await weatherService.getWeather("Tel Aviv");

  assert.equal(result.city, "Tel Aviv");
  assert.equal(result.temperature, 27);
  assert.equal(result.description, "clear sky");
  assert.equal(result.humidity, 60);
  assert.equal(result.windSpeed, 3.5);
  assert.ok(result.fetchedAt);
});

test("weather result is cached", async () => {
  let fetchCalls = 0;

  global.fetch = async () => {
    fetchCalls += 1;

    return {
      ok: true,
      async json() {
        return {
          name: "Tel Aviv",
          main: {
            temp: 27,
            humidity: 60,
          },
          weather: [
            {
              description: "clear sky",
            },
          ],
          wind: {
            speed: 3.5,
          },
        };
      },
    };
  };

  await weatherService.getWeather("Tel Aviv");
  await weatherService.getWeather("Tel Aviv");

  assert.equal(fetchCalls, 1);
});

test("missing city is rejected", async () => {
  await assert.rejects(
    () => weatherService.getWeather(""),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test("provider failure is handled safely", async () => {
  global.fetch = async () => {
    throw new Error("Network failure");
  };

  await assert.rejects(
    () => weatherService.getWeather("Tel Aviv"),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.message, "Weather provider is unavailable.");
      return true;
    }
  );
});

test("existing cache expires at fifteen minutes and matches city case-insensitively", async (t) => {
  let now = Date.now(), calls = 0;
  t.mock.method(Date, "now", () => now);
  global.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ name: "Tel Aviv", main: { temp: 27, humidity: 60 }, weather: [], wind: { speed: 3.5 } }) };
  };
  await weatherService.getWeather("Tel Aviv");
  now += 15 * 60000 - 1;
  await weatherService.getWeather("tel aviv");
  assert.equal(calls, 1);
  now++;
  await weatherService.getWeather("Tel Aviv");
  assert.equal(calls, 2);
});
