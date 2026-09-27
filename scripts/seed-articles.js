const mongoose = require("mongoose");
const connectDatabase = require("../config/database");
const Article = require("../models/Article");
const User = require("../models/User");
const { categories } = require("../config/articleRules");

const ARTICLE_COUNT = 500;
const SEED_PREFIX = "[SEED-D]";

function makeContent(index, category) {
  return {
    title: `${SEED_PREFIX} ${category} article ${index + 1}`,
    summary: `Demo summary for seeded ${category} article ${index + 1}.`,
    body:
      `This is demo content for article ${index + 1}. ` +
      `It belongs to the ${category} category and was generated for project testing.`,
    category,
    imageUrl: "",
  };
}

async function run() {
  const target = process.argv[2];

  if (!target) {
    throw new Error(
      "Explicit seed target required. Example: node scripts/seed-articles.js development"
    );
  }

  await connectDatabase();

  const reporters = await User.find({ role: "reporter" }).select("_id username");

  if (reporters.length === 0) {
    throw new Error(
      "No reporter users found. Create at least one reporter before seeding articles."
    );
  }

  // Remove only articles created by this seed script.
  // Unrelated articles and users are never deleted.
  await Article.deleteMany({
    "workingContent.title": { $regex: `^\\${SEED_PREFIX}` },
  });

  const now = Date.now();
  const articles = [];

  for (let index = 0; index < ARTICLE_COUNT; index += 1) {
    const reporter = reporters[index % reporters.length];
    const category = categories[index % categories.length];

    let status;

    switch (index % 4) {
      case 0:
        status = "draft";
        break;
      case 1:
        status = "pending";
        break;
      case 2:
        status = "returned";
        break;
      default:
        status = "published";
        break;
    }

    const workingContent = makeContent(index, category);

    const article = {
      reporter: reporter._id,
      workingContent,
      publishedContent: null,
      status,
      editorNote:
        status === "returned"
          ? "Please review and improve this demo article."
          : "",
      publishedAt: null,
      publicationHistory: [],
    };

    if (status === "published") {
      const daysAgo = index % 120;
      const firstPublication = new Date(
        now - daysAgo * 24 * 60 * 60 * 1000
      );

      article.publishedContent = { ...workingContent };
      article.publishedAt = firstPublication;
      article.publicationHistory = [firstPublication];

      // Some published articles demonstrate approved updates.
      if (index % 12 === 3) {
        const secondPublication = new Date(
          firstPublication.getTime() + 60 * 60 * 1000
        );
        const thirdPublication = new Date(
          firstPublication.getTime() + 2 * 60 * 60 * 1000
        );

        article.publicationHistory.push(
          secondPublication,
          thirdPublication
        );

        article.workingContent = {
          ...workingContent,
          summary: `${workingContent.summary} This article has approved updates.`,
        };

        article.publishedContent = {
          ...article.workingContent,
        };
      }
    }

    articles.push(article);
  }

  await Article.insertMany(articles);

  console.log(
    `Seed complete for target "${target}": ${articles.length} articles created.`
  );
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(`Seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  run,
  makeContent,
  ARTICLE_COUNT,
  SEED_PREFIX,
};