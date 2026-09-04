# Architecture

The application follows a small MVC-style structure:

- `routes/` maps HTTP paths to controller functions.
- `controllers/` handles requests and prepares responses.
- `models/` contains Mongoose schemas and data access code.
- `views/` contains EJS templates rendered by controllers.
- `middleware/` contains shared request and error handling.
- `public/` contains browser assets served as static files.
- `config/` contains infrastructure setup such as MongoDB connectivity.
- `scripts/` contains project maintenance and verification scripts.

`app.js` composes these parts and starts the HTTP server. The example articles endpoint currently returns in-memory data so the skeleton can run before MongoDB is configured.
