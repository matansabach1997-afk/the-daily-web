(() => {
  const storageKey = "daily_web_browser_id";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let memoryId = null;
  let storageUnavailable = false;

  function getBrowserId() {
    if (storageUnavailable) return memoryId;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (typeof stored === "string" && uuidPattern.test(stored)) {
        memoryId = stored.toLowerCase();
        return memoryId;
      }
      // Read storage on each call so clearing it creates a new identity.
      const generated = window.crypto.randomUUID();
      memoryId = generated;
      window.localStorage.setItem(storageKey, generated);
      return generated;
    } catch {
      storageUnavailable = true;
      // Blocked storage: reuse an ID in this document only. Never use Math.random.
      if (!memoryId) {
        try { memoryId = window.crypto.randomUUID(); } catch { return null; }
      }
      return memoryId;
    }
  }

  window.DailyWebBrowserIdentity = Object.freeze({ getBrowserId });
})();
