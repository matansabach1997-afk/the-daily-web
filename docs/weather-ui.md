# Public weather widget

The home/feed page renders its weather aside in a right-hand sidebar beside the feed on screens wider than 768px. At 768px and below it stacks above the feed, so infinite scrolling never pushes it out of reach. It defaults to Tel Aviv, matching the existing backend's documented example. The city is a non-secret `data-city` attribute in `views/index.ejs`; no geolocation, city-picker feature or second provider integration is introduced.

## Existing API reused unchanged

`GET /api/weather?city=Tel%20Aviv` returns:

```json
{
  "weather": {
    "city": "Tel Aviv",
    "temperature": 27,
    "description": "clear sky",
    "humidity": 60,
    "windSpeed": 3.5,
    "fetchedAt": "2026-10-03T12:00:00.000Z"
  }
}
```

Units are Celsius, relative humidity percent and metres/second (existing OpenWeatherMap metric request). `fetchedAt` is server retrieval time, not necessarily the provider's observation time. Errors use the existing central error envelope: missing city 400, missing configuration 503, provider/network failure 502. The UI uses a generic friendly fallback rather than displaying provider details. No route/controller/service/JSON-contract change was made.

Set `OPENWEATHER_API_KEY` only in the local ignored `.env` (or server environment), then restart the application. `.env.example` now contains an empty optional placeholder; never commit the real key. A missing key does not prevent the home page/news feed from loading. Only the backend talks to OpenWeatherMap; browser JS calls the relative `/api/weather` URL with no credentials, keys, provider icons or other direct provider requests.

## Cache and freshness

The existing service keeps a single in-process successful weather result for 15 minutes, reusing it when the returned city name matches the requested city case-insensitively. Another city replaces that slot; restart clears it. This integration does not redesign it into a per-city/distributed cache or change provider calls.

The widget requests weather once at page load. It uses `cache: no-store` to avoid adding an HTTP/browser cache; the service cache remains active. Successful results are displayed only while their fetchedAt age is below 15 minutes. Refresh is scheduled for the remaining lifetime of that returned result, not 15 minutes from page load. It also checks age on visibility/page-cache restoration, using the browser clock. Old details are hidden before refreshing and remain hidden if the request fails. Timers can be delayed in suspended tabs; the visibility/pageshow check handles resumption.

No tight polling or automatic failure-retry loop: after failure, show Retry weather. Requests have an eight-second client timeout. That bounds the widget's loading state; it does not add a provider-side timeout to the unchanged backend. No fresh result is fabricated on failure.

## UI isolation and accessibility

`public/js/weather.js` is an independent deferred script loaded after feed.js. It only modifies weather-prefixed nodes and never waits for or controls article queries. Success uses textContent; invalid/missing payload fields, HTTP failures, network errors and timeouts all show a friendly fallback. Loading uses an aria-live status and aria-busy; the retry button is keyboard-accessible. No JavaScript means a noscript explanation while the news page remains available.

Weather CSS is scoped in the existing feed.css. Flex wrapping, min-width zero and overflow wrapping keep the compact aside within the shared page width at mobile/tablet/desktop sizes. Shared header, feed.js and unrelated features remain unchanged.

## Verification

- `weather.test.js`: existing service behavior plus exact 15-minute expiry and case-insensitive cache reuse; external fetch is mocked.
- `weatherUi.test.js`: real Express home/assets/API envelope, secret exclusion, backend caching, missing configuration independent of home/health. No provider credentials/network access required.
- `weatherClient.test.js`: real browser script in DOM/fetch doubles; internal-only URL, loading/success/units/text safety, error/retry, timeout, stale expiry and tab restoration.
- Run `npm.cmd run check:syntax`, `node --test tests/weather.test.js tests/weatherClient.test.js tests/weatherUi.test.js`, and `npm.cmd test`.

Manual browser checks (not replaced by DOM doubles): set a valid local key and restart; open `/` at 360px, 768px and desktop; confirm readable wrapping/no horizontal overflow, all feed controls still work, and keyboard retry works. Network tools should show only our `/api/weather` request from this widget, never appid/key/provider URLs. Remove the key or simulate offline/API failure: fallback appears and article browsing still works. Leave a page open or resume a suspended tab beyond 15 minutes to check refresh. No real provider call or visual viewport verification is claimed by the automated tests.
