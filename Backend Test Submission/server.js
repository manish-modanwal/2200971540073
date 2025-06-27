// server.js
const app = require('./src/app');
const config = require('./src/config');
const { initDb } = require('./src/db');

// Initialize the database
initDb();

app.listen(config.port, () => {
    console.log(`URL Shortener Microservice listening on port ${config.port}`);
    console.log(`Base URL for shortlinks: http://${config.hostname}`);
});