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

// Comments are independent of the best-effort view-tracking request above.
(() => {
  const form = document.getElementById("comment-form");
  const article = document.querySelector("[data-public-article-id]");
  if (!form || !article) return;
  const articleId = article.dataset.publicArticleId;
  const list = document.getElementById("comments-list");
  const status = document.getElementById("comments-status");
  const reload = document.getElementById("comments-reload");
  const body = document.getElementById("comment-body");
  const submit = document.getElementById("comment-submit");
  const feedback = document.getElementById("comment-feedback");
  let sending = false, listRequest = 0;
  let listController;
  const comments = new Map();

  function renderComments() {
    list.replaceChildren();
    const ordered = [...comments.values()].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt) || b._id.localeCompare(a._id));
    for (const comment of ordered) {
      const item = document.createElement("li");
      const byline = document.createElement("p");
      byline.className = "comment-byline";
      byline.textContent = `${comment.author?.username || "Guest / former user"} · ${new Date(comment.createdAt).toLocaleString()}`;
      const text = document.createElement("p");
      text.className = "comment-body";
      text.dir = "auto";
      text.textContent = comment.body; // User text is never interpreted as HTML.
      item.append(byline, text);
      list.append(item);
    }
    status.textContent = comments.size ? `${comments.size} comments.` : "No comments yet. Be the first to comment.";
  }

  function errorMessage(payload, fallback) {
    const error = payload.error;
    return error?.fields?.body || error?.message || fallback;
  }

  async function loadComments() {
    listController?.abort();
    listController = new AbortController();
    const request = ++listRequest;
    reload.disabled = true;
    list.setAttribute("aria-busy", "true");
    status.textContent = "Loading comments...";
    try {
      const response = await fetch(`/api/comments?${new URLSearchParams({ articleId })}`, {
        signal: listController.signal, credentials: "same-origin", cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Could not load comments."));
      if (request !== listRequest) return;
      comments.clear();
      for (const comment of payload.data) comments.set(comment._id, comment);
      renderComments();
    } catch (error) {
      if (request !== listRequest) return;
      status.textContent = `${error.message || "Could not load comments."} Use Refresh comments to retry.`;
    } finally {
      if (request === listRequest) {
        reload.disabled = false;
        list.setAttribute("aria-busy", "false");
      }
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const commentBody = body.value.trim();
    feedback.dataset.error = "true";
    if (!commentBody || commentBody.length > 2000) {
      feedback.textContent = "Please enter a comment of 1–2000 characters.";
      return;
    }
    let browserId;
    try { browserId = window.DailyWebBrowserIdentity?.getBrowserId(); } catch { /* Authenticated users do not need an ID. */ }
    sending = true;
    submit.disabled = true;
    body.disabled = true;
    feedback.dataset.error = "false";
    feedback.textContent = "Posting comment...";
    try {
      const response = await fetch("/api/comments", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, body: commentBody, ...(browserId ? { browserId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const message = payload.error?.code === "INVALID_BROWSER_ID" ?
          "Browser identity is unavailable. Guest posting needs a browser that supports secure identity generation; you can still read comments or log in." :
          errorMessage(payload, "Could not post your comment.");
        throw new Error(message);
      }
      // An older list response must not remove the comment just accepted by the server.
      listController?.abort();
      ++listRequest;
      list.setAttribute("aria-busy", "false");
      reload.disabled = false;
      comments.set(payload.data._id, payload.data);
      renderComments();
      body.value = "";
      feedback.textContent = "Comment posted.";
      loadComments(); // Also recover older comments if the initial list was still loading.
    } catch (error) {
      feedback.dataset.error = "true";
      feedback.textContent = `${error.message || "Could not post your comment."} Your text has been kept. If the connection failed, refresh comments before retrying to avoid a duplicate.`;
    } finally {
      sending = false;
      submit.disabled = false;
      body.disabled = false;
    }
  });
  reload.addEventListener("click", loadComments);
  reload.hidden = false;
  body.disabled = false;
  submit.disabled = false;
  loadComments();
})();
