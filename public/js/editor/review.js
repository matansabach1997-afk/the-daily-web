(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const articleId = document.querySelector("main[data-article-id]").dataset.articleId;
  const path = `/api/articles/${encodeURIComponent(articleId)}`;
  const fields = {
    title: byId("article-title"), summary: byId("article-summary"),
    body: byId("article-body"), category: byId("article-category"), imageUrl: byId("article-image-url"),
  };
  let article = null;
  let savedContent = "";
  let busy = false;
  let unavailable = false;

  function content() {
    return Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
  }
  function dirty() { return article && JSON.stringify(content()) !== savedContent; }
  function feedback(message, kind = "") {
    byId("review-feedback").textContent = message;
    byId("review-feedback").dataset.kind = kind;
  }
  function updateControls() {
    // Presentation only: the existing APIs remain authoritative for every action.
    const editable = article && ["draft", "pending", "returned"].includes(article.status);
    const pending = article?.status === "pending";
    byId("content-fields").disabled = busy || unavailable || !editable;
    byId("save-button").hidden = !editable;
    byId("save-button").disabled = busy || unavailable;
    byId("approve-button").hidden = !pending;
    byId("return-form").hidden = !pending;
    for (const id of ["approve-button", "return-button", "editor-note", "delete-button", "reload-button"]) {
      byId(id).disabled = busy || (unavailable && id !== "reload-button");
    }
    byId("action-help").textContent = pending ? "Approve publishes the saved working content. Return requires a correction note." : "Approval and return are available for pending submissions only.";
  }
  function render(data) {
    article = data;
    unavailable = false;
    for (const [name, input] of Object.entries(fields)) input.value = data.workingContent[name];
    savedContent = JSON.stringify(content());
    byId("review-content").hidden = false;
    byId("article-status").textContent = data.status;
    byId("article-status").dataset.status = data.status;
    byId("article-meta").textContent = `Reporter: ${data.reporter?.username || "Unknown reporter"}`;
    byId("previous-note").hidden = !data.editorNote;
    byId("previous-note").textContent = `Editor note: ${data.editorNote || ""}`;
    const published = data.publishedContent && data.publishedAt;
    byId("publication-message").textContent = published ?
      "This approved version stays public while changes are under review. Approval replaces it with the working content." : "This article has never been published.";
    const panel = byId("published-content");
    panel.replaceChildren();
    if (published) {
      for (const name of Object.keys(fields)) {
        const label = document.createElement("dt");
        label.textContent = name === "imageUrl" ? "Image URL" : name;
        const value = document.createElement("dd");
        value.className = "editor-plain-text";
        value.textContent = data.publishedContent[name];
        panel.append(label, value);
      }
    }
    updateControls();
  }
  async function request(url, method = "GET", body) {
    const options = { method, headers: { Accept: "application/json" } };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || "Request failed. Please retry.");
      error.status = response.status;
      error.fields = payload?.error?.fields || {};
      throw error;
    }
    return payload?.data;
  }
  function showError(error) {
    feedback(error.status === 409 ? `${error.message} Reload the article before continuing; your unsaved text is still here.` : error.message, "error");
    for (const [name, message] of Object.entries(error.fields || {})) {
      const item = document.createElement("p");
      item.textContent = `${name}: ${message}`;
      byId("field-errors").append(item);
    }
    if ([401, 403, 404, 409].includes(error.status)) unavailable = true;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    byId("field-errors").replaceChildren();
    updateControls();
    try { await action(); } catch (error) { showError(error); }
    finally { busy = false; updateControls(); }
  }
  async function save() {
    if (!dirty()) return;
    feedback("Saving changes...");
    render(await request(`${path}/working-content`, "PATCH", { workingContent: content() }));
  }
  async function load() {
    feedback("Loading article...");
    render(await request(`/api/workspace/articles/${encodeURIComponent(articleId)}`));
    feedback("Article loaded.");
  }
  byId("article-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => { await save(); feedback("Saved.", "success"); });
  });
  byId("approve-button").addEventListener("click", () => run(async () => {
    await save();
    feedback("Publishing...");
    render(await request(`${path}/approvals`, "POST", {}));
    feedback("Approved and published.", "success");
  }));
  byId("return-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const editorNote = byId("editor-note").value.trim();
    if (!editorNote) { feedback("Enter a correction note before returning the article.", "error"); return; }
    run(async () => {
      await save();
      feedback("Returning article...");
      render(await request(`${path}/returns`, "POST", { editorNote }));
      byId("editor-note").value = "";
      feedback("Returned to the reporter with your note.", "success");
    });
  });
  byId("delete-button").addEventListener("click", () => {
    if (busy || !window.confirm("Permanently delete this article, its comments, and view statistics?")) return;
    run(async () => {
      feedback("Deleting article...");
      await request(path, "DELETE");
      article = null;
      unavailable = true;
      byId("review-content").hidden = true;
      feedback("Article deleted. Return to the Editor Workspace to review another article.", "success");
    });
  });
  byId("reload-button").addEventListener("click", () => {
    if (dirty() && !window.confirm("Discard unsaved changes and reload the article?")) return;
    run(load);
  });
  byId("editor-back-link").addEventListener("click", (event) => {
    if (busy || (dirty() && !window.confirm("Leave without saving your changes?"))) event.preventDefault();
  });
  byId("article-form").addEventListener("input", () => { if (!busy) feedback("Unsaved changes. Save before leaving."); });
  run(load);
})();
