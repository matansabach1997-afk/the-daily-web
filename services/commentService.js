const Comment = require("../models/Comment");
const Article = require("../models/Article");
const BrowserIdentity = require("../models/BrowserIdentity");
const { allowedFields, text, id, browserId } = require("../utils/validation");
const requireActor = require("../utils/authorization");
const httpError = require("../utils/httpError");
const articleQueryService = require("./articleQueryService");

function commentDto(comment) {
    return {
        _id: comment._id,
        article: comment.article,
        body: comment.body,
        author: comment.author,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
    };
}

async function listComments(articleId) {
    const validArticleId = id(articleId);

    await articleQueryService.getPublic(validArticleId);

    const comments = await Comment.find({ article: validArticleId })
        .sort({ createdAt: -1, _id: -1 })
        .populate("author", "_id username")
        .lean();

    return comments.map(commentDto);
}

async function getComment(commentId) {
    const comment = await Comment.findById(id(commentId))
        .populate("author", "_id username")
        .lean();

    if (!comment) {
        throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");
    }

    await articleQueryService.getPublic(String(comment.article));

    return commentDto(comment);
}

async function createComment(actor, input) {
    if (actor) requireActor(actor);
    allowedFields(input, ["articleId", "body", "browserId"]);

    const articleId = id(input.articleId);
    const body = text(input.body, "body", { min: 1, max: 2000 });
    const identity = !actor || input.browserId !== undefined ? browserId(input.browserId) : null;
    await articleQueryService.requirePublicArticle(articleId);
    if (!actor) await reserveGuestComment(identity);

    const comment = await Comment.create({
        article: articleId,
        body,
        author: actor ? actor._id : null,
        browserId: actor ? null : identity,
    });

    // A previously admitted request must not recreate an orphan after article deletion.
    if (!await Article.exists({ _id: articleId })) {
        await Comment.deleteOne({ _id: comment._id });
        throw httpError(404, "ARTICLE_NOT_FOUND", "Article not found.");
    }

    const saved = await Comment.findById(comment._id)
        .populate("author", "_id username")
        .lean();

    if (!saved) throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");

    return commentDto(saved);
}

async function reserveGuestComment(identity) {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60000);
    const filter = {
        _id: identity,
        $or: [
            { "guestCommentTimes.2": { $exists: false } },
            { "guestCommentTimes.0": { $lte: minuteAgo } },
        ],
    };
    const update = {
        // Keep only the latest three server timestamps, ordered even under concurrency.
        $push: { guestCommentTimes: { $each: [now], $sort: 1, $slice: -3 } },
        $max: { expiresAt: new Date(now.getTime() + 60000) },
    };
    try {
        await BrowserIdentity.updateOne(filter, update, { upsert: true }).maxTimeMS(5000);
    } catch (error) {
        if (error.code !== 11000) throw error;
        // An existing full window (or simultaneous first insert) conflicts with _id.
        // Retry without insertion: the same atomic predicate still enforces the cap.
        const result = await BrowserIdentity.updateOne(filter, update).maxTimeMS(5000);
        if (result.matchedCount === 1) return;
        throw httpError(429, "COMMENT_RATE_LIMIT", "Maximum 3 guest comments per minute. Please wait up to 60 seconds and try again.");
    }
}

async function updateComment(actor, commentId, input) {
    requireActor(actor);
    allowedFields(input, ["body"]);

    const comment = await Comment.findById(id(commentId));

    if (!comment) {
        throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");
    }

    if (String(comment.author) !== String(actor._id)) {
        throw httpError(403, "FORBIDDEN", "You cannot edit this comment.");
    }

    comment.body = text(input.body, "body", { min: 1, max: 2000 });
    await comment.save();

    const saved = await Comment.findById(comment._id)
        .populate("author", "_id username")
        .lean();

    return commentDto(saved);
}

async function deleteComment(actor, commentId) {
    requireActor(actor);

    const comment = await Comment.findById(id(commentId));

    if (!comment) {
        throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");
    }

    if (String(comment.author) !== String(actor._id)) {
        throw httpError(403, "FORBIDDEN", "You cannot delete this comment.");
    }

    await Comment.deleteOne({ _id: comment._id });
}

module.exports = {
    commentDto,
    listComments,
    getComment,
    createComment,
    updateComment,
    deleteComment,
};
