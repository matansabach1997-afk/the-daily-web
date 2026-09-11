const COOKIE_NAME = "daily_web_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function readSessionCookie(header = "") {
  const matches = header.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  // Duplicate or malformed cookies do not authenticate a caller.
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function options() {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...options(), maxAge: SESSION_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, options());
}

module.exports = { SESSION_MS, readSessionCookie, setSessionCookie, clearSessionCookie };
