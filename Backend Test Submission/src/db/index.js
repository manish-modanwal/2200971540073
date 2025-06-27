// src/db/index.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');
const logger = require('../middleware/logger');

let db;

function initDb() {
    db = new sqlite3.Database(config.databasePath, (err) => {
        if (err) {
            console.error('Error opening database', err.message);
            logger.logEvent("database_error", null, { message: "Error opening database", error: err.message });
        } else {
            console.log('Connected to the SQLite database.');
            db.serialize(() => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS shortened_urls (
                        shortcode TEXT PRIMARY KEY,
                        original_url TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL
                    );
                `, (err) => {
                    if (err) {
                        console.error('Error creating shortened_urls table', err.message);
                        logger.logEvent("database_error", null, { message: "Error creating shortened_urls table", error: err.message });
                    }
                });

                db.run(`
                    CREATE TABLE IF NOT EXISTS clicks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        shortcode TEXT NOT NULL,
                        timestamp TEXT NOT NULL,
                        referrer TEXT,
                        ip_address TEXT,
                        FOREIGN KEY (shortcode) REFERENCES shortened_urls(shortcode)
                    );
                `, (err) => {
                    if (err) {
                        console.error('Error creating clicks table', err.message);
                        logger.logEvent("database_error", null, { message: "Error creating clicks table", error: err.message });
                    } else {
                        logger.logEvent("database_initialized");
                        console.log("Database initialized.");
                    }
                });
            });
        }
    });
}

function getDb() {
    return db;
}

module.exports = { initDb, getDb };