const service = require("../services/commentService");
const { allowedFields } = require("../utils/validation");

async function listComments(req, res) {
    allowedFields(req.query, ["articleId"], "query");

    const comments = await service.listComments(req.query.articleId);

    res.json({ data: comments });
}

async function getComment(req, res) {
    allowedFields(req.query, [], "query");

    const comment = await service.getComment(req.params.id);

    res.json({ data: comment });
}

async function createComment(req, res) {
    const comment = await service.createComment(req.user, req.body);

    res.status(201).json({ data: comment });
}

async function updateComment(req, res) {
    const comment = await service.updateComment(
        req.user,
        req.params.id,
        req.body
    );

    res.json({ data: comment });
}

async function deleteComment(req, res) {
    allowedFields(req.body === undefined ? {} : req.body, []);

    await service.deleteComment(req.user, req.params.id);

    res.status(204).end();
}

module.exports = {
    listComments,
    getComment,
    createComment,
    updateComment,
    deleteComment,
};