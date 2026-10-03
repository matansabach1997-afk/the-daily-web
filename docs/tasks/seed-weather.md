# Seed Data and Weather Backend

## Seed Data

The seed script is located at:

scripts/seed-articles.js

It generates 500 demo articles using the existing User and Article models.

The generated data includes:
- Multiple reporters
- All configured article categories
- draft, pending, returned and published statuses
- Different publication dates
- Published articles with publication history
- Some published articles with multiple approved updates

The script only removes articles identified as data created by this seed script.
It does not delete unrelated users or articles.

An explicit target argument is required.

Example:

node --env-file-if-exists=.env scripts/seed-articles.js development

At least one reporter user must already exist before running the seed.

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

Seed tests verify the generated article count, structure, categories, seed identification and content variation.