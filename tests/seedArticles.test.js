const test = require("node:test");
const assert = require("node:assert/strict");

const {
  makeContent,
  ARTICLE_COUNT,
  SEED_PREFIX,
} = require("../scripts/seed-articles");

const { categories } = require("../config/articleRules");

test("seed is configured to generate at least 500 articles", () => {
  assert.ok(ARTICLE_COUNT >= 500);
});

test("seed content matches the Article content structure", () => {
  const content = makeContent(0, "technology");

  assert.equal(typeof content.title, "string");
  assert.equal(typeof content.summary, "string");
  assert.equal(typeof content.body, "string");
  assert.equal(content.category, "technology");
  assert.equal(typeof content.imageUrl, "string");
});

test("seed supports every configured article category", () => {
  for (const category of categories) {
    const content = makeContent(1, category);

    assert.equal(content.category, category);
  }
});

test("seeded articles use an identifiable seed prefix", () => {
  const content = makeContent(0, "science");

  assert.ok(content.title.startsWith(SEED_PREFIX));
});

test("generated content varies between articles", () => {
  const first = makeContent(0, "technology");
  const second = makeContent(1, "science");

  assert.notEqual(first.title, second.title);
  assert.notEqual(first.body, second.body);
  assert.notEqual(first.category, second.category);
});