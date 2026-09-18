const loginForm = document.getElementById("login-form");
const loginFields = document.getElementById("login-fields");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginMessage = document.getElementById("login-message");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginFields.disabled) return;
  loginMessage.textContent = "";
  if (!usernameInput.value.trim() || !loginForm.reportValidity()) {
    loginMessage.textContent = "Enter your username and password.";
    return;
  }

  loginFields.disabled = true;
  loginForm.setAttribute("aria-busy", "true");
  loginMessage.textContent = "Signing in...";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value }),
    });
    if (!response.ok) {
      const result = await response.json();
      loginMessage.textContent = result.error?.message || "Login failed. Please try again.";
      return;
    }
    // The browser stores the HttpOnly cookie; JavaScript never reads the token.
    window.location.replace("/");
  } catch {
    loginMessage.textContent = "Unable to sign in. Check your connection and try again.";
  } finally {
    passwordInput.value = "";
    loginFields.disabled = false;
    loginForm.removeAttribute("aria-busy");
  }
});

// Enable only after the handler prevents a normal form submission.
loginFields.disabled = false;
