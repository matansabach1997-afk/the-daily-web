(() => {
  "use strict";
  const filter = document.getElementById("status-filter");
  const list = document.getElementById("article-list");
  const feedback = document.getElementById("queue-feedback");
  const empty = document.getElementById("empty-message");
  const refresh = document.getElementById("refresh-button");
  const more = document.getElementById("load-more-button");
  let cursor = null;
  let generation = 0;
  let loading = false;
  const ids = new Set();

  function card(article) {
    const node = document.createElement("article");
    node.className = "editor-card";
    const heading = document.createElement("h2");
    heading.textContent = article.workingContent.title.trim() || "Untitled article";
    const meta = document.createElement("p");
    meta.className = "editor-card-meta";
    const status = document.createElement("span");
    status.className = "editor-status";
    status.dataset.status = article.status;
    status.textContent = article.status;
    const reporter = document.createElement("span");
    reporter.textContent = `Reporter: ${article.reporter?.username || "Unknown reporter"}`;
    const category = document.createElement("span");
    category.textContent = `Category: ${article.workingContent.category || "Uncategorized"}`;
    const updated = document.createElement("span");
    const date = new Date(article.updatedAt);
    updated.textContent = `Updated: ${Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
    const publication = document.createElement("span");
    publication.textContent = article.publishedContent && article.publishedAt ? "Has a published version" : "Never published";
    meta.append(status, reporter, category, updated, publication);
    const link = document.createElement("a");
    link.href = `/editor/review/${encodeURIComponent(article._id)}`;
    link.textContent = "Open review";
    node.append(heading, meta, link);
    return node;
  }

  async function load(reset = false) {
    if (loading && !reset) return;
    const current = ++generation;
    if (reset) {
      cursor = null;
      ids.clear();
      list.replaceChildren();
      empty.hidden = true;
      more.hidden = true;
    }
    loading = true;
    refresh.disabled = more.disabled = true;
    feedback.textContent = "Loading articles...";
    feedback.dataset.kind = "";
    const query = new URLSearchParams();
    if (filter.value) query.set("status", filter.value);
    if (cursor) query.set("cursor", cursor);
    try {
      const response = await fetch(`/api/workspace/articles?${query}`, { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => null);
      if (current !== generation) return;
      if (!response.ok) throw new Error(payload?.error?.message || "Could not load articles. Try Refresh.");
      for (const article of payload.data) {
        if (ids.has(article._id)) continue;
        ids.add(article._id);
        list.append(card(article));
      }
      cursor = payload.meta.nextCursor;
      more.hidden = !payload.meta.hasMore;
      empty.hidden = ids.size !== 0;
      feedback.textContent = "";
    } catch (error) {
      if (current !== generation) return;
      feedback.textContent = error.message;
      feedback.dataset.kind = "error";
    } finally {
      if (current === generation) {
        loading = false;
        refresh.disabled = more.disabled = false;
      }
    }
  }
  filter.addEventListener("change", () => load(true));
  refresh.addEventListener("click", () => load(true));
  more.addEventListener("click", () => load());
  load(true);
})();
