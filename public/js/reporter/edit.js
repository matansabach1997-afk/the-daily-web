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
  const backLink = document.getElementById("reporter-back-link");
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
  let saveQueue = null;
  let pendingSnapshot = null;
  let lastSavedJson = null;
  let autosaveBlockedAfterError = false;
  let submitting = false;
  let leaving = false;

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
    for (const control of Object.values(controls)) control.disabled = !editable || submitting || leaving;
    saveButton.disabled = submitting || leaving;
    submitButton.disabled = submitting || leaving;
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
    const body = JSON.stringify({ workingContent: snapshot });
    const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/working-content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      // Keep even a normal in-flight autosave alive on refresh/navigation.
      // Larger UTF-8 payloads still save normally: keepalive has a 64 KiB budget.
      keepalive: new TextEncoder().encode(body).byteLength <= 60 * 1024,
    });
    return readJson(response);
  }

  async function processSaves() {
    while (pendingSnapshot) {
      const snapshot = pendingSnapshot;
      const serialized = snapshotJson(snapshot);
      pendingSnapshot = null;
      clearTimeout(saveTimer);
      saveTimer = null;
      if (serialized === lastSavedJson) continue;

      setFeedback("Saving...");
      setFieldErrors();
      try {
        const payload = await sendSave(snapshot);
        article = payload.data;
        // This exact form snapshot was acknowledged, even if the server trimmed it.
        lastSavedJson = serialized;
        updateStatusUi();
      } catch (error) {
        autosaveBlockedAfterError = true;
        if (!pendingSnapshot) pendingSnapshot = snapshot;
        clearTimeout(saveTimer);
        saveTimer = null;
        setFieldErrors(error.fields);
        // Redirecting after a failed save would discard the unsaved text.
        const message = error.status === 401 ?
          "Please log in in another tab, then retry saving. Your unsaved text is still here." :
          (error.message || "Save failed");
        setFeedback(message, "error");
        return false;
      }
    }
    setFeedback("Saved", "success");
    return true;
  }

  function drainSaves() {
    // All callers await the WHOLE queue, including edits added during a request.
    if (saveQueue) return saveQueue;
    if (!isEditable() || autosaveBlockedAfterError) return Promise.resolve(false);
    saveQueue = processSaves().finally(() => { saveQueue = null; });
    return saveQueue;
  }

  function queueAutosave() {
    if (!isEditable() || submitting || leaving) return;
    pendingSnapshot = currentContent();
    autosaveBlockedAfterError = false;
    clearTimeout(saveTimer);
    setFeedback("Saving...");
    saveTimer = setTimeout(() => {
      saveTimer = null;
      drainSaves();
    }, AUTOSAVE_DELAY_MS);
  }

  function saveLatest() {
    if (!isEditable()) return Promise.resolve(false);
    clearTimeout(saveTimer);
    saveTimer = null;
    // Always queue the current form: it may undo a different in-flight snapshot.
    // processSaves skips it if that same snapshot has already been acknowledged.
    pendingSnapshot = currentContent();
    autosaveBlockedAfterError = false;
    return drainSaves();
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
    if (!isEditable() || submitting || leaving) return;
    submitting = true;
    updateStatusUi();
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
      updateStatusUi();
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
  saveButton.addEventListener("click", () => saveLatest());
  submitButton.addEventListener("click", submitArticle);
  revisionButton.addEventListener("click", startRevision);

  function flushPendingSave() {
    if (saveTimer !== null && !submitting && !leaving) saveLatest();
  }
  // blur does not bubble; capture lets the form observe its input fields.
  form.addEventListener("blur", flushPendingSave, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushPendingSave();
  });
  window.addEventListener("pagehide", flushPendingSave);

  // This in-app navigation can wait for an acknowledgement. Tab close/reload cannot.
  backLink.addEventListener("click", async (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const dirty = snapshotJson(currentContent()) !== lastSavedJson;
    if (!isEditable() || (!dirty && !saveQueue && !submitting && !leaving)) return;
    event.preventDefault();
    if (submitting || leaving) return;
    leaving = true;
    updateStatusUi();
    try {
      if (await saveLatest()) window.location.assign(backLink.href);
    } finally {
      leaving = false;
      updateStatusUi();
    }
  });

  loadArticle();
})();
