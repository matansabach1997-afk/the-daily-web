const assert = require("node:assert/strict");
const User = require("../models/User");
const Session = require("../models/Session");
const Article = require("../models/Article");
const { hashPassword } = require("../services/passwordService");
const { request } = require("./helpers");

// Fake credentials and content for isolated test databases only.
const password = "test-only-password-123";
const content = { title: "Approved title", summary: "A summary", body: "Full article body", category: "science", imageUrl: "https://example.com/image.jpg" };

async function accounts() {
  await Promise.all([User.init(), Session.init(), Article.init()]);
  const passwordHash = await hashPassword(password);
  const [reporter, other, editor] = await User.create([
    { username: "reporter_one", role: "reporter", passwordHash },
    { username: "reporter_two", role: "reporter", passwordHash },
    { username: "editor_one", role: "editor", passwordHash },
  ]);
  return { reporter, other, editor };
}

async function login(baseUrl, user, suppliedPassword = password) {
  const result = await request(baseUrl, "/api/auth/login", { method: "POST", body: { username: user.username, password: suppliedPassword } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.headers.get("set-cookie").split(";")[0];
}

module.exports = { accounts, login, password, content };
