const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedWeather = null;
let cacheExpiresAt = 0;

async function getWeather(city) {
  const normalizedCity = String(city || "").trim();

  if (!normalizedCity) {
    const error = new Error("City is required.");
    error.status = 400;
    throw error;
  }

  const now = Date.now();

  if (
    cachedWeather &&
    cachedWeather.city.toLowerCase() === normalizedCity.toLowerCase() &&
    now < cacheExpiresAt
  ) {
    return cachedWeather;
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    const error = new Error("Weather service is not configured.");
    error.status = 503;
    throw error;
  }

  const url =
    "https://api.openweathermap.org/data/2.5/weather" +
    `?q=${encodeURIComponent(normalizedCity)}` +
    `&appid=${encodeURIComponent(apiKey)}` +
    "&units=metric";

  let response;

  try {
    response = await fetch(url);
  } catch {
    const error = new Error("Weather provider is unavailable.");
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error("Weather provider returned an error.");
    error.status = 502;
    throw error;
  }

  const data = await response.json();

  const weather = {
    city: data.name,
    temperature: data.main.temp,
    description: data.weather?.[0]?.description || "",
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
    fetchedAt: new Date().toISOString(),
  };

  cachedWeather = weather;
  cacheExpiresAt = now + CACHE_TTL_MS;

  return weather;
}

function clearWeatherCache() {
  cachedWeather = null;
  cacheExpiresAt = 0;
}

module.exports = {
  getWeather,
  clearWeatherCache,
};