(() => {
  const widget = document.getElementById("home-weather");
  if (!widget) return;
  const status = document.getElementById("weather-status");
  const details = document.getElementById("weather-details");
  const summary = document.getElementById("weather-summary");
  const meta = document.getElementById("weather-meta");
  const time = document.getElementById("weather-time");
  const retry = document.getElementById("weather-retry");
  const maxAge = 15 * 60 * 1000;
  let loading = false, expiresAt = 0, refreshTimer;

  async function loadWeather() {
    if (loading) return;
    loading = true;
    clearTimeout(refreshTimer);
    details.hidden = true;
    retry.hidden = true;
    widget.setAttribute("aria-busy", "true");
    status.textContent = "Loading weather...";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const query = new URLSearchParams({ city: widget.dataset.city });
      const response = await fetch(`/api/weather?${query}`, {
        signal: controller.signal, credentials: "omit", cache: "no-store",
      });
      if (!response.ok) throw new Error("Weather unavailable");
      const { weather } = await response.json();
      const fetchedAt = Date.parse(weather?.fetchedAt);
      if (!weather || typeof weather.city !== "string" || typeof weather.description !== "string" ||
          ![weather.temperature, weather.humidity, weather.windSpeed, fetchedAt].every(Number.isFinite) ||
          fetchedAt > Date.now() + 60000 || Date.now() - fetchedAt >= maxAge) {
        throw new Error("Invalid or expired weather");
      }
      summary.textContent = `${weather.city}: ${Math.round(weather.temperature)} °C · ${weather.description || "Conditions unavailable"}`;
      meta.textContent = `Humidity ${weather.humidity}% · Wind ${weather.windSpeed} m/s`;
      time.dateTime = weather.fetchedAt;
      time.textContent = new Date(fetchedAt).toLocaleString();
      details.hidden = false;
      status.textContent = "";
      expiresAt = fetchedAt + maxAge;
      // Refresh at the returned data's expiry, not 15 minutes after opening this page.
      refreshTimer = setTimeout(loadWeather, Math.max(1, expiresAt - Date.now()));
    } catch {
      expiresAt = 0;
      status.textContent = "Weather is temporarily unavailable. You can keep reading the news.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      loading = false;
      widget.setAttribute("aria-busy", "false");
    }
  }

  function checkFreshness() {
    // Timers can be suspended in background tabs or the Back/Forward cache.
    if (!document.hidden && expiresAt && Date.now() >= expiresAt) loadWeather();
  }
  retry.addEventListener("click", loadWeather);
  document.addEventListener("visibilitychange", checkFreshness);
  window.addEventListener("pageshow", checkFreshness);
  loadWeather();
})();
