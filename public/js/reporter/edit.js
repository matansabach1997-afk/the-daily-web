(() => {
  "use strict";

  const main = document.querySelector("main[data-article-id]");
  const form = document.getElementById("article-form");
  if (!main || !form) return;

  const articleId = main.dataset.articleId;
  const statusBadge = document.getElementById("article-status");
  const feedback = document.getElementById("save-feedback");
  const notePanel = document.getElementById("editor-note-panel");
  const noteText = document.getElementById("editor-note-text");
  const fieldErrors = document.getElementById("field-errors");
  const saveButton = document.getElementById("save-button");
  const submitButton = document.getElementById("submit-button");
  const revisionButton = document.getElementById("revision-button");
  const controls = {
    title: document.getElementById("article-title"),
    summary: document.getElementById("article-summary"),
    body: document.getElementById("article-body"),
    category: document.getElementById("article-category"),
    imageUrl: document.getElementById("article-image-url"),
  };

  const EDITABLE_STATUSES = new Set(["draft", "returned"]);
  const AUTOSAVE_DELAY_MS = 700;

  let article = null;
  let saveTimer = null;
  let saveInFlight = null;
  let pendingSnapshot = null;
  let lastSavedJson = null;
  let autosaveBlockedAfterError = false;
  let submitting = false;

  function setFeedback(message, kind = "") {
    feedback.textContent = message;
    feedback.dataset.kind = kind;
  }

  function setFieldErrors(fields = {}) {
    fieldErrors.replaceChildren();
    for (const [field, message] of Object.entries(fields)) {
      const item = document.createElement("p");
      item.textContent = `${field}: ${message}`;
      fieldErrors.append(item);
    }
  }

  function currentContent() {
    return {
      title: controls.title.value,
      summary: controls.summary.value,
      body: controls.body.value,
      category: controls.category.value,
      imageUrl: controls.imageUrl.value,
    };
  }

  function snapshotJson(content) {
    return JSON.stringify(content);
  }

  function fillForm(content) {
    for (const [field, control] of Object.entries(controls)) control.value = content?.[field] || "";
  }

  function isEditable() {
    return article && EDITABLE_STATUSES.has(article.status);
  }

  function updateStatusUi() {
    if (!article) return;
    statusBadge.textContent = article.status;
    statusBadge.dataset.status = article.status;

    const editable = isEditable();
    for (const control of Object.values(controls)) control.disabled = !editable;
    saveButton.hidden = !editable;
    submitButton.hidden = !editable;
    revisionButton.hidden = article.status !== "published";

    notePanel.hidden = article.status !== "returned" || !article.editorNote;
    noteText.textContent = article.editorNote || "";

    if (article.status === "pending") setFeedback("Submitted and waiting for editor review.", "success");
    if (article.status === "published") setFeedback("Published. Start a revision to make changes.", "success");
  }

  async function readJson(response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || "Request failed.");
      error.status = response.status;
      error.code = payload?.error?.code;
      error.fields = payload?.error?.fields || {};
      throw error;
    }
    return payload;
  }

  function handleAuthFailure(error) {
    if (error.status === 401) {
      window.location.assign("/login");
      return true;
    }
    return false;
  }

  async function sendSave(snapshot) {
    const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/working-content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ workingContent: snapshot }),
    });
    return readJson(response);
  }

  async function drainSaves() {
    if (saveInFlight || !pendingSnapshot || !isEditable() || autosaveBlockedAfterError) return !autosaveBlockedAfterError;

    const snapshot = pendingSnapshot;
    const serialized = snapshotJson(snapshot);
    pendingSnapshot = null;
    if (serialized === lastSavedJson) {
      setFeedback("Saved", "success");
      return true;
    }

    setFeedback("Saving...");
    setFieldErrors();
    saveInFlight = sendSave(snapshot);
    try {
      const payload = await saveInFlight;
      article = payload.data;
      lastSavedJson = snapshotJson(article.workingContent);
      autosaveBlockedAfterError = false;
      setFeedback("Saved", "success");
      updateStatusUi();
    } catch (error) {
      if (handleAuthFailure(error)) return false;
      autosaveBlockedAfterError = true;
      setFieldErrors(error.fields);
      setFeedback(error.message || "Save failed", "error");
      return false;
    } finally {
      saveInFlight = null;
    }

    if (pendingSnapshot && !autosaveBlockedAfterError) return drainSaves();
    return true;
  }

  function queueAutosave() {
    if (!isEditable() || submitting) return;
    pendingSnapshot = currentContent();
    autosaveBlockedAfterError = false;
    clearTimeout(saveTimer);
    setFeedback("Saving...");
    saveTimer = setTimeout(() => {
      saveTimer = null;
      drainSaves();
    }, AUTOSAVE_DELAY_MS);
  }

  async function saveLatest({ force = false } = {}) {
    if (!isEditable()) return true;
    clearTimeout(saveTimer);
    saveTimer = null;
    const latest = currentContent();
    if (force || snapshotJson(latest) !== lastSavedJson) pendingSnapshot = latest;
    autosaveBlockedAfterError = false;

    if (saveInFlight) {
      try { await saveInFlight; } catch { /* drainSaves reports the error. */ }
    }
    if (pendingSnapshot) return drainSaves();
    return !autosaveBlockedAfterError;
  }

  async function loadArticle() {
    try {
      const response = await fetch(`/api/workspace/articles/${encodeURIComponent(articleId)}`, { headers: { Accept: "application/json" } });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const payload = await readJson(response);
      article = payload.data;
      fillForm(article.workingContent);
      lastSavedJson = snapshotJson(currentContent());
      setFieldErrors();
      setFeedback("Saved", "success");
      updateStatusUi();
    } catch (error) {
      if (handleAuthFailure(error)) return;
      form.hidden = true;
      setFeedback(error.status === 404 ? "Article not found or you do not have access to it." : (error.message || "Could not load article."), "error");
      statusBadge.textContent = "Unavailable";
      statusBadge.dataset.status = "error";
    }
  }

  async function submitArticle() {
    if (!isEditable() || submitting) return;
    submitting = true;
    submitButton.disabled = true;
    saveButton.disabled = true;
    setFieldErrors();

    try {
      const saved = await saveLatest();
      if (!saved) return;
      setFeedback("Submitting...");
      const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await readJson(response);
      article = payload.data;
      pendingSnapshot = null;
      setFeedback("Submitted", "success");
      updateStatusUi();
    } catch (error) {
      if (handleAuthFailure(error)) return;
      setFieldErrors(error.fields);
      setFeedback(error.message || "Submission failed", "error");
    } finally {
      submitting = false;
      saveButton.disabled = false;
      submitButton.disabled = false;
    }
  }

  async function startRevision() {
    if (!article || article.status !== "published") return;
    revisionButton.disabled = true;
    setFieldErrors();
    setFeedback("Starting revision...");
    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await readJson(response);
      article = payload.data;
      fillForm(article.workingContent);
      lastSavedJson = snapshotJson(currentContent());
      setFeedback("Revision started. Changes will autosave.", "success");
      updateStatusUi();
      controls.title.focus();
    } catch (error) {
      if (handleAuthFailure(error)) return;
      setFieldErrors(error.fields);
      setFeedback(error.message || "Could not start revision.", "error");
    } finally {
      revisionButton.disabled = false;
    }
  }

  form.addEventListener("input", queueAutosave);
  form.addEventListener("change", queueAutosave);
  saveButton.addEventListener("click", () => saveLatest({ force: true }));
  submitButton.addEventListener("click", submitArticle);
  revisionButton.addEventListener("click", startRevision);

  loadArticle();
})();
