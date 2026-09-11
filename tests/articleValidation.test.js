const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Article = require("../models/Article");
const { validateContent } = require("../services/articleWorkflowService");
const { content } = require("./fixtures");

test("incomplete drafts persistable; completeness belongs to workflow validation", async () => {
  const empty = validateContent({}, { allowMissing: true });
  assert.ok(Object.values(empty).every((value) => value === ""));
  await new Article({ reporter: new mongoose.Types.ObjectId(), workingContent: {} }).validate();
  await assert.rejects(new Article({ reporter: new mongoose.Types.ObjectId() }).validate(), { name: "ValidationError" });
  assert.throws(() => validateContent(empty, { complete: true }), { status: 422 });
  assert.deepEqual(validateContent(content, { complete: true }), content);
});

test("content validation rejects unsafe types, fields, lengths and image schemes", () => {
  for (const input of [null, [], { ...content, body: {} }, { title: "partial save" }, { ...content, status: "published" }]) {
    assert.throws(() => validateContent(input), { status: 400 });
  }
  for (const input of [{ ...content, title: "a".repeat(201) }, { ...content, category: "unknown" }, { ...content, imageUrl: "javascript:alert(1)" }, { ...content, imageUrl: "https://user:password@example.com/x" }]) {
    assert.throws(() => validateContent(input), { status: 422 });
  }
  assert.equal(validateContent({ ...content, imageUrl: "/images/article.jpg" }).imageUrl, "/images/article.jpg");
  assert.equal(validateContent({ ...content, body: "  body  " }).body, "  body  ");
});
