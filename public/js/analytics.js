(() => {
  const byId = (id) => document.getElementById(id);
  const searchForm = byId("analytics-search-form");
  const search = byId("analytics-search");
  const list = byId("analytics-articles");
  const listStatus = byId("analytics-list-status");
  const more = byId("analytics-more");
  const selectedLabel = byId("analytics-selected");
  const range = byId("analytics-range");
  const refresh = byId("analytics-refresh");
  const status = byId("analytics-status");
  const report = byId("analytics-report");
  const chart = byId("analytics-chart");
  const markers = byId("analytics-markers");
  const hour = 3600000;
  let selected = null, currentData = null;
  let cursor = null, hasMore = true, listLoading = false, searchTerm = "";
  let listRequest = 0, analyticsRequest = 0;
  let listController, analyticsController;
  const choices = new Map();

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function readJson(url, signal) {
    const response = await fetch(url, { signal, credentials: "same-origin", cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Unable to load data.");
    return payload;
  }

  function updateSelection() {
    for (const [id, button] of choices) button.setAttribute("aria-pressed", String(id === selected?._id));
  }

  async function loadArticles() {
    if (listLoading || !hasMore) return;
    listLoading = true;
    more.disabled = true;
    list.setAttribute("aria-busy", "true");
    listStatus.textContent = "Loading articles...";
    const request = ++listRequest;
    listController = new AbortController();
    const params = new URLSearchParams({ sort: "newest" });
    if (searchTerm) params.set("q", searchTerm);
    if (cursor) params.set("cursor", cursor);
    try {
      const payload = await readJson(`/api/articles?${params}`, listController.signal);
      if (request !== listRequest) return;
      for (const article of payload.data) {
        if (choices.has(article._id)) continue;
        const item = element("li");
        const button = element("button", article.title);
        button.type = "button";
        button.dir = "auto";
        button.addEventListener("click", () => {
          selected = article;
          selectedLabel.textContent = `${article.title} — Article ID: ${article._id}`;
          updateSelection();
          loadAnalytics();
        });
        choices.set(article._id, button);
        item.append(button);
        list.append(item);
      }
      updateSelection();
      cursor = payload.meta.nextCursor;
      hasMore = payload.meta.hasMore;
      more.hidden = !hasMore;
      more.textContent = "Load more articles";
      listStatus.textContent = choices.size === 0 ? "No public articles match. Try another search or return after an article is approved." :
        `${choices.size} articles loaded.${hasMore ? " Load more to see additional choices." : " End of results."}`;
    } catch (error) {
      if (request !== listRequest) return;
      listStatus.textContent = `${error.message || "Unable to load articles."} Please try again.`;
      more.hidden = false;
      more.textContent = "Retry articles";
    } finally {
      if (request === listRequest) {
        listLoading = false;
        more.disabled = false;
        list.setAttribute("aria-busy", "false");
      }
    }
  }

  function resetArticles() {
    listController?.abort();
    ++listRequest;
    listLoading = false;
    cursor = null;
    hasMore = true;
    searchTerm = search.value.trim();
    choices.clear();
    list.replaceChildren();
    loadArticles();
  }

  function utcLabel(value) {
    return new Date(value).toISOString().replace("T", " ").replace("Z", " UTC");
  }

  function svgElement(tag, attributes, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function drawChart(data) {
    const from = new Date(data.period.from).getTime();
    const to = new Date(data.period.to).getTime();
    const width = Math.max(280, chart.clientWidth || 800), height = 300;
    const left = 52, right = width - 16, top = 32, bottom = height - 60;
    const values = new Map(data.series.map((point) => [new Date(point.bucketStart).getTime(), point.views]));
    const maximum = Math.max(1, ...data.series.map((point) => point.views));
    const x = (time) => left + (time - from) / (to - from) * (right - left);
    const y = (views) => bottom - views / maximum * (bottom - top);
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": "views-chart-title views-chart-description" });
    svg.append(svgElement("title", { id: "views-chart-title" }, "Hourly recorded article views"));
    svg.append(svgElement("desc", { id: "views-chart-description" }, `${data.periodViews} recorded views in this period. Publication and update times and recorded hourly values are listed below.`));
    // Integer ticks remain meaningful even when the highest hourly count is just one.
    const ticks = [...new Set([0, Math.ceil(maximum / 2), maximum])];
    for (const value of ticks) {
      svg.append(svgElement("line", { x1: left, x2: right, y1: y(value), y2: y(value), class: "analytics-grid" }));
      svg.append(svgElement("text", { x: left - 7, y: y(value) + 4, "text-anchor": "end", class: "analytics-axis-label" }, value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })));
    }
    svg.append(svgElement("text", { x: left, y: 17, class: "analytics-axis-label" }, "Views / hour"));
    for (const [fraction, anchor] of [[0, "start"], [0.5, "middle"], [1, "end"]]) {
      const time = from + (to - from) * fraction;
      const label = new Date(time).toISOString();
      svg.append(svgElement("text", { x: x(time), y: bottom + 22, "text-anchor": anchor, class: "analytics-axis-label" }, label.slice(5, 10)));
      svg.append(svgElement("text", { x: x(time), y: bottom + 40, "text-anchor": anchor, class: "analytics-axis-label" }, label.slice(11, 16) + "Z"));
    }
    // Sparse API buckets imply zero, not a straight line between distant nonzero hours.
    const points = [];
    for (let time = from; time < to; time += hour) points.push(`${x(time + hour / 2)},${y(values.get(time) || 0)}`);
    svg.append(svgElement("polyline", { points: points.join(" "), class: "analytics-line" }));
    for (const marker of data.publicationMarkers) {
      const line = svgElement("line", { x1: x(new Date(marker.at).getTime()), x2: x(new Date(marker.at).getTime()), y1: top, y2: bottom, class: `analytics-marker ${marker.type}` });
      line.append(svgElement("title", {}, `${marker.type}: ${utcLabel(marker.at)}`));
      svg.append(line);
    }
    chart.replaceChildren(svg);
  }

  function renderAnalytics(data) {
    report.hidden = false; // Measure the chart only after its container is visible.
    byId("analytics-total").textContent = data.totalViews.toLocaleString();
    byId("analytics-period-total").textContent = data.periodViews.toLocaleString();
    byId("analytics-period").textContent = `${utcLabel(data.period.from)} (included) to ${utcLabel(data.period.to)} (excluded).`;
    markers.replaceChildren();
    for (const marker of data.publicationMarkers) {
      markers.append(element("li", `${marker.type === "publication" ? "First publication" : "Approved update"}: ${utcLabel(marker.at)}`));
    }
    if (data.publicationMarkers.length === 0) markers.append(element("li", "No publication or update markers in this period."));
    const textData = byId("analytics-data");
    textData.replaceChildren();
    for (const point of data.series) textData.append(element("li", `${utcLabel(point.bucketStart)}: ${point.views} views`));
    if (data.series.length === 0) textData.append(element("li", "All hours in this period have zero recorded views."));
    drawChart(data);
    status.textContent = data.periodViews === 0 ? "No recorded views in this period. The graph shows zero; any returned approval markers are still shown." : "Analytics loaded.";
  }

  async function loadAnalytics() {
    if (!selected) return;
    analyticsController?.abort();
    const request = ++analyticsRequest;
    analyticsController = new AbortController();
    currentData = null;
    report.hidden = true;
    report.setAttribute("aria-busy", "true");
    refresh.disabled = true;
    status.textContent = "Loading analytics...";
    const days = ["7", "30", "90"].includes(range.value) ? Number(range.value) : 30;
    const to = new Date(Math.floor(Date.now() / hour) * hour + hour);
    const from = new Date(to.getTime() - days * 24 * hour);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    try {
      const payload = await readJson(`/api/view-stats/articles/${encodeURIComponent(selected._id)}/analytics?${params}`, analyticsController.signal);
      if (request !== analyticsRequest) return;
      currentData = payload.data;
      renderAnalytics(currentData);
    } catch (error) {
      if (request !== analyticsRequest) return;
      status.textContent = `${error.message || "Unable to load analytics."} Use Refresh analytics to try again; log in again if your session expired.`;
    } finally {
      if (request === analyticsRequest) {
        refresh.disabled = false;
        report.setAttribute("aria-busy", "false");
      }
    }
  }

  searchForm.addEventListener("submit", (event) => { event.preventDefault(); resetArticles(); });
  more.addEventListener("click", loadArticles);
  range.addEventListener("change", loadAnalytics);
  refresh.addEventListener("click", loadAnalytics);
  window.addEventListener("resize", () => { if (currentData && !report.hidden) drawChart(currentData); });
  loadArticles();
})();
