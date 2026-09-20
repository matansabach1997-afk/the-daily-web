document.documentElement.classList.add("js-enabled");

const loginLink = document.getElementById("login-link");
const reporterWorkspaceLink = document.getElementById("reporter-workspace-link");
const editorWorkspaceLink = document.getElementById("editor-workspace-link");
const analyticsLink = document.getElementById("analytics-link");
const accountControls = document.getElementById("account-controls");
const currentUserLabel = document.getElementById("current-user");
const logoutButton = document.getElementById("logout-button");
const sessionMessage = document.getElementById("session-message");

async function refreshSession() {
  try {
    const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Session lookup failed");
    const { data } = await response.json();
    loginLink.hidden = Boolean(data.user);
    reporterWorkspaceLink.hidden = data.user?.role !== "reporter";
    editorWorkspaceLink.hidden = data.user?.role !== "editor";
    analyticsLink.hidden = data.user?.role !== "editor";
    accountControls.hidden = !data.user;
    currentUserLabel.textContent = data.user ? `${data.user.username} (${data.user.role})` : "";
    sessionMessage.textContent = "";
    if (data.user && window.location.pathname === "/login") window.location.replace("/");
  } catch {
    sessionMessage.textContent = "Unable to check your session. Please refresh or try again later.";
  }
}

logoutButton.addEventListener("click", async () => {
  if (logoutButton.disabled) return;
  logoutButton.disabled = true;
  sessionMessage.textContent = "Signing out...";
  try {
    const response = await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) throw new Error("Logout failed");
    window.location.replace("/");
  } catch {
    sessionMessage.textContent = "Unable to log out. Please try again.";
  } finally {
    logoutButton.disabled = false;
  }
});
logoutButton.hidden = false;

// Also refresh when Back/Forward restores an older page from the browser cache.
window.addEventListener("pageshow", refreshSession);
