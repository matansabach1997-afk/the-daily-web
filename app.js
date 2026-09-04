const express = require("express");

const app = express();

const PORT = 3000;

app.get("/", (req, res) => {
    res.send("The Daily Web server is running");
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});