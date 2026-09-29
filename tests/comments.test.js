const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const app = require("../app");
const Article = require("../models/Article");
const Comment = require("../models/Comment");

const {
    openDatabase,
    closeDatabase,
    startHttp,
    stopHttp,
    request,
} = require("./helpers");

const { accounts, login, content } = require("./fixtures");

let database;
let http;
let users;
let cookies;
let publicArticle;
let privateArticle;

before(async () => {
    database = await openDatabase("comments");

    await Comment.createCollection();
    await Comment.createIndexes();

    users = await accounts();

    publicArticle = await Article.create({
        reporter: users.reporter._id,
        workingContent: content,
        publishedContent: content,
        status: "published",
        publishedAt: new Date(),
    });

    privateArticle = await Article.create({
        reporter: users.reporter._id,
        workingContent: content,
        status: "draft",
    });

    http = await startHttp(app);

    cookies = {
        reporter: await login(http.baseUrl, users.reporter),
        other: await login(http.baseUrl, users.other),
        editor: await login(http.baseUrl, users.editor),
    };
});

after(async () => {
    await stopHttp(http?.server);
    await closeDatabase(database);
});

async function call(path, method = "GET", body, role) {
    return request(http.baseUrl, path, {
        method,
        body,
        cookie: role ? cookies[role] : undefined,
    });
}

test("authenticated user can create and read a comment on a public article", async () => {
    const created = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "My first comment",
        },
        "reporter"
    );

    assert.equal(created.status, 201);
    assert.equal(created.data.data.body, "My first comment");
    assert.equal(
        String(created.data.data.article),
        String(publicArticle._id)
    );
    assert.equal(
        String(created.data.data.author._id),
        String(users.reporter._id)
    );

    const commentId = created.data.data._id;

    const read = await call(`/api/comments/${commentId}`);

    assert.equal(read.status, 200);
    assert.equal(read.data.data._id, commentId);
    assert.equal(read.data.data.body, "My first comment");
});

test("comments can be listed for a public article", async () => {
    const result = await call(
        `/api/comments?articleId=${publicArticle._id}`
    );

    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.data));

    assert.ok(
        result.data.data.every(
            (comment) =>
                String(comment.article) === String(publicArticle._id)
        )
    );
});

test("guest cannot create a comment", async () => {
    const result = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "Guest comment",
        }
    );

    assert.equal(result.status, 401);
});

test("comments cannot be created or listed for a private article", async () => {
    const created = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(privateArticle._id),
            body: "Private article comment",
        },
        "reporter"
    );

    assert.equal(created.status, 404);

    const listed = await call(
        `/api/comments?articleId=${privateArticle._id}`
    );

    assert.equal(listed.status, 404);
});

test("comment body is validated", async () => {
    const empty = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "   ",
        },
        "reporter"
    );

    assert.equal(empty.status, 422);

    const unknownField = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "Valid comment",
            status: "tampered",
        },
        "reporter"
    );

    assert.equal(unknownField.status, 400);
});

test("comment owner can update and delete the comment", async () => {
    const created = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "Before update",
        },
        "reporter"
    );

    const commentId = created.data.data._id;

    const updated = await call(
        `/api/comments/${commentId}`,
        "PATCH",
        { body: "After update" },
        "reporter"
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.data.data.body, "After update");

    const removed = await call(
        `/api/comments/${commentId}`,
        "DELETE",
        undefined,
        "reporter"
    );

    assert.equal(removed.status, 204);

    const read = await call(`/api/comments/${commentId}`);

    assert.equal(read.status, 404);
});

test("another authenticated user cannot update or delete someone else's comment", async () => {
    const created = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "Owned comment",
        },
        "reporter"
    );

    const commentId = created.data.data._id;

    const update = await call(
        `/api/comments/${commentId}`,
        "PATCH",
        { body: "Unauthorized update" },
        "other"
    );

    assert.equal(update.status, 403);

    const remove = await call(
        `/api/comments/${commentId}`,
        "DELETE",
        undefined,
        "other"
    );

    assert.equal(remove.status, 403);
});

test("invalid comment and article IDs are rejected", async () => {
    const invalidComment = await call("/api/comments/not-an-id");

    assert.equal(invalidComment.status, 400);

    const invalidArticle = await call(
        "/api/comments?articleId=not-an-id"
    );

    assert.equal(invalidArticle.status, 400);
});