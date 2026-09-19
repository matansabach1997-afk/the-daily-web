(() => {
  const form = document.getElementById("feed-filters");
  const search = document.getElementById("feed-search");
  const category = document.getElementById("feed-category");
  const sort = document.getElementById("feed-sort");
  const results = document.getElementById("feed-results");
  const status = document.getElementById("feed-status");
  const more = document.getElementById("feed-more");
  const sentinel = document.getElementById("feed-sentinel");
  let cursor = null;
  let hasMore = true;
  let loading = false;
  let failed = false;
  let waiting = false;
  let requestNumber = 0;
  let controller;
  let debounce;
  const seen = new Set();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function card(article) {
    const node = element("article", undefined, "news-card");
    node.dataset.articleId = article._id;
    if (article.imageUrl) {
      const image = element("img");
      image.src = article.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => { image.hidden = true; });
      node.append(image);
    }
    const content = element("div", undefined, "news-card-content");
    const heading = element("h2");
    const link = element("a", article.title);
    link.href = `/articles/${encodeURIComponent(article._id)}`;
    link.dir = "auto";
    heading.append(link);
    const byline = element("p", `By ${article.reporter?.username || "The Daily Web"} · `, "card-byline");
    const date = element("time", new Date(article.publishedAt).toLocaleDateString());
    date.dateTime = article.publishedAt;
    byline.append(date);
    const summary = element("p", article.summary);
    summary.dir = "auto";
    content.append(element("p", article.category, "eyebrow"), heading, byline, summary);
    node.append(content);
    return node;
  }

  function updateControls() {
    results.setAttribute("aria-busy", String(loading));
    more.hidden = !hasMore;
    more.disabled = loading || waiting;
    more.textContent = failed ? "Try again" : "Load more";
  }

  async function loadMore() {
    if (loading || waiting || !hasMore) return;
    loading = true;
    failed = false;
    const currentRequest = ++requestNumber;
    controller = new AbortController();
    status.textContent = "Loading articles...";
    updateControls();
    const params = new URLSearchParams({ sort: sort.value });
    if (search.value.trim()) params.set("q", search.value.trim());
    if (category.value) params.set("category", category.value);
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/articles?${params}`, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not load articles.");
      // A newer search may have started while this response was in flight.
      if (currentRequest !== requestNumber) return;
      for (const article of payload.data) {
        if (seen.has(article._id)) continue;
        results.append(card(article));
        seen.add(article._id);
      }
      cursor = payload.meta.nextCursor;
      hasMore = payload.meta.hasMore;
      status.textContent = seen.size === 0 ? "No articles match your search." :
        hasMore ? `${seen.size} articles loaded.` : `All ${seen.size} articles loaded. End of results.`;
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      failed = true;
      status.textContent = `${error.message || "Could not load articles."} Please try again.`;
    } finally {
      if (currentRequest === requestNumber) {
        loading = false;
        updateControls();
        // Re-observe after layout changes; a short batch may still leave it visible.
        if (observer) {
          observer.unobserve(sentinel);
          if (hasMore && !failed) observer.observe(sentinel);
        }
      }
    }
  }

  function reset(delay = 0) {
    clearTimeout(debounce);
    controller?.abort();
    ++requestNumber;
    cursor = null;
    hasMore = true;
    failed = false;
    loading = false;
    waiting = true;
    seen.clear();
    results.replaceChildren();
    status.textContent = "Searching...";
    observer?.unobserve(sentinel);
    updateControls();
    debounce = setTimeout(() => { waiting = false; loadMore(); }, delay);
  }

  const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !failed) loadMore();
  }, { rootMargin: "300px" }) : null;
  form.addEventListener("submit", (event) => { event.preventDefault(); reset(); });
  search.addEventListener("input", () => reset(300));
  category.addEventListener("change", () => reset());
  sort.addEventListener("change", () => reset());
  more.addEventListener("click", loadMore);
  loadMore();
})();
