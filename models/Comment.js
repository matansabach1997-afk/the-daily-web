const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
    {
        article: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Article",
            required: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
        autoCreate: false,
        autoIndex: false,
    }
);

commentSchema.index({ article: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Comment", commentSchema);