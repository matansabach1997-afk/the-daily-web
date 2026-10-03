const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const app = require("../app");
const Article = require("../models/Article");
const Comment = require("../models/Comment");
const BrowserIdentity = require("../models/BrowserIdentity");
const { randomUUID } = require("node:crypto");

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
    await BrowserIdentity.createIndexes();

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

test("guest needs a valid browser identity to create a comment", async () => {
    const result = await call(
        "/api/comments",
        "POST",
        {
            articleId: String(publicArticle._id),
            body: "Guest comment",
        }
    );

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, "INVALID_BROWSER_ID");
    for (const browserId of [null, "bad", 42, [randomUUID()], { $ne: null }]) {
        const invalid = await call("/api/comments", "POST", { articleId: String(publicArticle._id), body: "Test", browserId });
        assert.equal(invalid.status, 400);
    }
});

test("guest creates and publicly reads comments without leaking browser identity or creating a User", async () => {
    const browserId = randomUUID();
    const User = require("../models/User");
    const before = await User.countDocuments();
    const created = await call("/api/comments", "POST", {
        articleId: String(publicArticle._id), body: "  Guest text <script>not markup</script>  ", browserId: browserId.toUpperCase(),
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.author, null);
    assert.equal(created.data.data.body, "Guest text <script>not markup</script>");
    assert.ok(!JSON.stringify(created.data).includes(browserId));
    const stored = await Comment.findById(created.data.data._id).select("+browserId").lean();
    assert.equal(stored.browserId, browserId);
    const read = await call(`/api/comments/${stored._id}`);
    assert.equal(read.status, 200);
    const listed = await call(`/api/comments?articleId=${publicArticle._id}`);
    assert.ok(listed.data.data.some((row) => row._id === String(stored._id)));
    assert.ok(!JSON.stringify(listed.data).includes("browserId"));
    assert.equal(await User.countDocuments(), before);
    assert.equal((await call(`/api/comments/${stored._id}`, "PATCH", { body: "Not owned" })).status, 401);
    assert.equal((await call(`/api/comments/${stored._id}`, "DELETE")).status, 401);
    assert.equal((await call(`/api/comments/${stored._id}`, "PATCH", { body: "Not owned" }, "reporter")).status, 403);
});

test("guest cap is three per rolling minute across articles, independent for each browser", async () => {
    const browserId = randomUUID();
    const another = await Article.create({ reporter: users.reporter._id, workingContent: content, publishedContent: content, publishedAt: new Date(), status: "pending" });
    for (let index = 0; index < 3; index++) {
        const articleId = index === 1 ? String(another._id) : String(publicArticle._id);
        assert.equal((await call("/api/comments", "POST", { articleId, body: "Allowed", browserId })).status, 201);
    }
    const fourth = await call("/api/comments", "POST", { articleId: String(another._id), body: "Blocked", browserId });
    assert.equal(fourth.status, 429);
    assert.equal(fourth.data.error.code, "COMMENT_RATE_LIMIT");
    assert.equal((await call("/api/comments", "POST", { articleId: String(another._id), body: "Other browser", browserId: randomUUID() })).status, 201);
    assert.equal((await BrowserIdentity.findById(browserId).lean()).guestCommentTimes.length, 3);
    // A connected account keeps its existing behavior even when the sent guest ID is capped.
    assert.equal((await call("/api/comments", "POST", { articleId: String(another._id), body: "Signed in", browserId }, "reporter")).status, 201);
});

test("parallel guest requests cannot exceed the cap, including racing first inserts", async () => {
    const browserId = randomUUID();
    const results = await Promise.all(Array.from({ length: 10 }, () => call("/api/comments", "POST", {
        articleId: String(publicArticle._id), body: "Concurrent", browserId,
    })));
    assert.equal(results.filter((result) => result.status === 201).length, 3);
    assert.equal(results.filter((result) => result.status === 429).length, 7);
    assert.equal(await Comment.countDocuments({ browserId }), 3);
});

test("rolling window persists in MongoDB and reopens without depending on TTL cleanup", async () => {
    const indexes = await BrowserIdentity.collection.indexes();
    assert.ok(indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    const browserId = randomUUID();
    const now = Date.now();
    await BrowserIdentity.create({ _id: browserId, guestCommentTimes: [now - 61000, now - 10000, now - 1000].map((value) => new Date(value)), expiresAt: new Date(now + 60000) });
    const input = { articleId: String(publicArticle._id), body: "Window", browserId };
    assert.equal((await call("/api/comments", "POST", input)).status, 201);
    assert.equal((await call("/api/comments", "POST", input)).status, 429);
    const times = [new Date(now - 65000), new Date(now - 64000), new Date(now - 63000)];
    await BrowserIdentity.updateOne({ _id: browserId }, { $set: { guestCommentTimes: times } });
    for (let index = 0; index < 3; index++) assert.equal((await call("/api/comments", "POST", input)).status, 201);
    assert.equal((await call("/api/comments", "POST", input)).status, 429);
});

test("guest validation/public visibility happen before quota reservation", async () => {
    const browserId = randomUUID();
    for (const body of ["", "  ", "x".repeat(2001)]) {
        assert.equal((await call("/api/comments", "POST", { articleId: String(publicArticle._id), body, browserId })).status, 422);
    }
    const denied = await call("/api/comments", "POST", { articleId: String(privateArticle._id), body: "Not public", browserId });
    assert.equal(denied.status, 404);
    assert.equal(await BrowserIdentity.findById(browserId), null);
    assert.equal(await Comment.countDocuments({ article: privateArticle._id }), 0);
    assert.equal((await call("/api/comments", "POST", { articleId: String(publicArticle._id), body: "Tamper", browserId, author: users.editor._id })).status, 400);
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

test("public SSR article includes the existing body plus AJAX comment controls, not private content", async () => {
    const response = await fetch(`${http.baseUrl}/articles/${publicArticle._id}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(content.body));
    assert.match(html, /id="comments-list"/);
    assert.match(html, /id="comment-form"/);
    assert.match(html, /maxlength="2000" required disabled/);
    assert.ok(html.indexOf('src="/js/browser-identity.js"') < html.indexOf('src="/js/article.js"'));
    assert.ok(!html.includes("workingContent"));
});
