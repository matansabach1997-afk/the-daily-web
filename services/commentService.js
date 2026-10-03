const Comment = require("../models/Comment");
const { allowedFields, text, id } = require("../utils/validation");
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
    requireActor(actor);
    allowedFields(input, ["articleId", "body"]);

    const articleId = id(input.articleId);
    await articleQueryService.getPublic(articleId);

    const body = text(input.body, "body", { min: 1, max: 2000 });

    const comment = await Comment.create({
        article: articleId,
        body,
        author: actor._id,
    });

    const saved = await Comment.findById(comment._id)
        .populate("author", "_id username")
        .lean();

    return commentDto(saved);
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