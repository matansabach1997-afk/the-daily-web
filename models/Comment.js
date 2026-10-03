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
            maxlength: 2000,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            required: function () { return !this.browserId; },
        },
        browserId: {
            type: String,
            default: null,
            select: false,
            required: function () { return !this.author; },
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
