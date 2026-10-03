(() => {
  "use strict";

  const list = document.getElementById("article-list");
  const empty = document.getElementById("empty-articles");
  const feedback = document.getElementById("reporter-feedback");
  const createButton = document.getElementById("create-draft-button");
  const refreshButton = document.getElementById("refresh-articles-button");
  const loadMoreButton = document.getElementById("load-more-button");

  if (!list || !createButton) return;

  let nextCursor = null;
  let loading = false;
  const renderedIds = new Set();

  function setFeedback(message, kind = "") {
    feedback.textContent = message;
    feedback.dataset.kind = kind;
  }

  function escapeText(value) {
    return typeof value === "string" ? value : "";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function articleTitle(article) {
    const title = article.workingContent?.title?.trim();
    return title || "Untitled draft";
  }

  function actionLabel(status) {
    if (status === "pending") return "View";
    if (status === "published") return "View / revise";
    if (status === "returned") return "Continue editing";
    return "Edit";
  }

  function articleCard(article) {
    const card = document.createElement("article");
    card.className = "reporter-article-card";
    card.dataset.articleId = article._id;

    const header = document.createElement("div");
    header.className = "reporter-card-heading";

    const title = document.createElement("h3");
    title.textContent = articleTitle(article);

    const status = document.createElement("span");
    status.className = "status-badge";
    status.dataset.status = article.status;
    status.textContent = article.status;

    header.append(title, status);
    card.append(header);

    const meta = document.createElement("p");
    meta.className = "reporter-card-meta";
    meta.textContent = `Updated ${formatDate(article.updatedAt)}`;
    card.append(meta);

    if (article.status === "returned" && article.editorNote) {
      const note = document.createElement("p");
      note.className = "reporter-card-note";
      note.textContent = `Editor note: ${escapeText(article.editorNote)}`;
      card.append(note);
    }

    const link = document.createElement("a");
    link.className = "reporter-card-link";
    link.href = `/reporter/edit/${encodeURIComponent(article._id)}`;
    link.textContent = actionLabel(article.status);
    card.append(link);

    return card;
  }

  async function readJson(response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || "Request failed.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function loadArticles({ reset = false } = {}) {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    loadMoreButton.disabled = true;
    setFeedback(reset ? "Refreshing articles..." : "Loading articles...");

    if (reset) {
      nextCursor = null;
      renderedIds.clear();
      list.replaceChildren();
    }

    try {
      const query = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : "";
      const response = await fetch(`/api/workspace/articles${query}`, { headers: { Accept: "application/json" } });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = await readJson(response);
      for (const article of payload.data) {
        if (renderedIds.has(article._id)) continue;
        renderedIds.add(article._id);
        list.append(articleCard(article));
      }
      nextCursor = payload.meta?.nextCursor || null;
      empty.hidden = renderedIds.size !== 0;
      loadMoreButton.hidden = !payload.meta?.hasMore;
      setFeedback("");
    } catch (error) {
      setFeedback(error.message || "Could not load your articles.", "error");
    } finally {
      loading = false;
      refreshButton.disabled = false;
      loadMoreButton.disabled = false;
    }
  }

  createButton.addEventListener("click", async () => {
    createButton.disabled = true;
    setFeedback("Creating draft...");
    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ workingContent: {} }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = await readJson(response);
      window.location.assign(`/reporter/edit/${encodeURIComponent(payload.data._id)}`);
    } catch (error) {
      setFeedback(error.message || "Could not create a draft.", "error");
      createButton.disabled = false;
    }
  });

  refreshButton.addEventListener("click", () => loadArticles({ reset: true }));
  loadMoreButton.addEventListener("click", () => loadArticles());

  loadArticles({ reset: true });
})();
