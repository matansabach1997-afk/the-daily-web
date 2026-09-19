(async () => {
  try {
    const article = document.querySelector("[data-public-article-id]");
    if (!article) return;
    const browserId = window.DailyWebBrowserIdentity?.getBrowserId();
    if (!browserId) return;
    // One best-effort attempt per document load, no automatic retry/deduplication.
    await fetch("/api/view-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ articleId: article.dataset.publicArticleId, browserId }),
    });
  } catch {
    // Statistics must never replace the server-rendered content or block reading.
  }
})();
