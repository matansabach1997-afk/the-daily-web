# Seed Data and Weather Backend

## Seed Data

The seed script is located at:

scripts/seed-articles.js

It generates 500 demo articles using the existing User, Article, Comment and ViewStat models.

The generated data includes:

- Multiple reporters
- All configured article categories
- draft, pending, returned and published statuses
- Different publication dates
- Published articles with publication history
- Some published articles with multiple approved updates
- Three demo Reporters and one Editor, created with salted password hashes
- 256 comments and 7,760 time-distributed ViewStat buckets
- Incomplete drafts, complete pending/public content and a bundled local image

Reruns replace 500 reserved, deterministic article IDs and reset their dependent comments/views. Unrelated data and existing demo passwords are preserved; legacy random-ID seed records are not deleted. Use an idle, dedicated local demo database. A stopped run can be repaired by rerunning.

An explicit target argument matching the actual local MONGODB_URI database name is required. Production and system database targets are refused.

Set SEED_PASSWORD through a secure prompt (12-128 characters); do not commit it. See the [README seed instructions](../../README.md#repeatable-local-demo-seed).

Run `node --env-file-if-exists=.env scripts/seed-articles.js <exact-database-name>`. No pre-existing Reporter account is required. Reserved username/ID collisions are refused before data changes.

## Weather API

Endpoint:

GET /api/weather?city=Tel%20Aviv

The weather backend uses the OpenWeatherMap API.

The API key must be supplied through the environment variable:

OPENWEATHER_API_KEY

No API key is stored in the repository.

Example successful response:

{
  "weather": {
    "city": "Tel Aviv",
    "temperature": 27,
    "description": "clear sky",
    "humidity": 60,
    "windSpeed": 3.5,
    "fetchedAt": "2026-09-27T18:00:00.000Z"
  }
}

## Weather Cache

Successful weather results are cached on the server.

Cache lifetime:

15 minutes

Repeated requests for the same city use the cached result until it expires.

## Failure Behavior

Missing city:

400

Missing weather configuration:

503

Weather provider/network failure:

502

Provider errors are handled by the backend and are not returned as raw provider responses.

## Tests

Weather tests mock the external fetch request and do not require a real provider call.

Seed tests also run against an isolated local MongoDB database: all statuses/categories, password hashing, content validation, analytics before/after markers, safe reruns, collision refusal, absence of orphans and preservation of unrelated records. They do not seed the development database.
