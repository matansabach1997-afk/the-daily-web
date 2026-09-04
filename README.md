# The Daily Web

A starter Node.js application organized with an MVC-style structure. It uses Express for HTTP routing, EJS for server-rendered views, and Mongoose for MongoDB models.

## Requirements

- Node.js
- MongoDB (optional while using the example in-memory endpoint)

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set values for your environment. The project intentionally does not load `.env` by itself because no extra environment package has been added. Set these variables in your shell or runtime when needed.

3. Start the application:

   ```sh
   npm start
   ```

4. Open `http://localhost:3000`.

## Useful endpoints

- `GET /` – EJS home page
- `GET /health` – health response
- `GET /api/articles` – example articles JSON response

## Verification

Run the lightweight smoke checks:

```sh
npm test
```

The script verifies the home page, health endpoint, articles API, static CSS, and both HTML and API 404 responses without adding a test framework.

See [`docs/architecture.md`](docs/architecture.md) for the folder responsibilities.
