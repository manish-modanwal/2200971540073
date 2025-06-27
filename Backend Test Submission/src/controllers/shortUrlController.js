// src/controllers/shortUrlController.js
const { getDb } = require('../db');
const config = require('../config');
const { logEvent } = require('../middleware/logger');
const { generateUniqueShortcode, isShortcodeValid, getClientIp } = require('../services/shortcodeService'); // New service

// Helper for async DB operations with promises
const dbRun = (query, params) => new Promise((resolve, reject) => {
    getDb().run(query, params, function (err) {
        if (err) reject(err);
        resolve(this);
    });
});

const dbGet = (query, params) => new Promise((resolve, reject) => {
    getDb().get(query, params, (err, row) => {
        if (err) reject(err);
        resolve(row);
    });
});

const dbAll = (query, params) => new Promise((resolve, reject) => {
    getDb().all(query, params, (err, rows) => {
        if (err) reject(err);
        resolve(rows);
    });
});


exports.createShortUrl = async (req, res) => {
    const { url, validity, shortcode: customShortcode } = req.body;

    if (!url || !config.urlRegex.test(url)) {
        logEvent("error", null, { status: 400, message: "Invalid or missing 'url'. Must be a valid URL format." });
        return res.status(400).json({ error: "Bad Request", message: "Invalid or missing 'url'. Must be a valid URL format." });
    }

    let validityMinutes = validity !== undefined ? parseInt(validity, 10) : config.defaultValidityMinutes;
    if (isNaN(validityMinutes) || validityMinutes <= 0) {
        logEvent("error", null, { status: 400, message: "'validity' must be a positive integer representing minutes." });
        return res.status(400).json({ error: "Bad Request", message: "'validity' must be a positive integer representing minutes." });
    }

    let finalShortcode;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + validityMinutes * 60 * 1000);

    try {
        if (customShortcode) {
            if (!isShortcodeValid(customShortcode)) {
                logEvent("error", null, { status: 400, message: "Custom shortcode must be alphanumeric and between 3 and 15 characters long." });
                return res.status(400).json({ error: "Bad Request", message: "Custom shortcode must be alphanumeric and between 3 and 15 characters long." });
            }

            const existingRow = await dbGet("SELECT 1 FROM shortened_urls WHERE shortcode = ?", [customShortcode]);
            if (existingRow) {
                logEvent("error", customShortcode, { status: 409, message: `Custom shortcode '${customShortcode}' is already in use.` });
                return res.status(409).json({ error: "Conflict", message: `Custom shortcode '${customShortcode}' is already in use.` });
            }
            finalShortcode = customShortcode;
        } else {
            finalShortcode = await generateUniqueShortcode(getDb(), config.shortcodeLength);
        }

        await dbRun(
            "INSERT INTO shortened_urls (shortcode, original_url, created_at, expires_at) VALUES (?, ?, ?, ?)",
            [finalShortcode, url, createdAt.toISOString(), expiresAt.toISOString()]
        );

        const shortlink = `http://${config.hostname}/${finalShortcode}`;
        const expiryIso = expiresAt.toISOString();

        logEvent("url_created", finalShortcode, {
            original_url: url,
            validity_minutes: validityMinutes,
            custom_shortcode_used: !!customShortcode,
            shortlink: shortlink,
            expiry: expiryIso
        });

        return res.status(201).json({
            shortlink: shortlink,
            expiry: expiryIso
        });

    } catch (err) {
        console.error("Error creating short URL:", err.message);
        logEvent("error", null, { event: "db_insert_failed", exception: err.message });
        return res.status(500).json({ error: "Internal Server Error", message: "Could not save the short URL due to a database error." });
    }
};

exports.redirectShortUrl = async (req, res) => {
    const { shortcode } = req.params;

    try {
        const urlData = await dbGet("SELECT original_url, expires_at FROM shortened_urls WHERE shortcode = ?", [shortcode]);

        if (!urlData) {
            logEvent("redirect_failed", shortcode, { reason: "not_found" });
            return res.status(404).json({ error: "Not Found", message: "Short link not found." });
        }

        const originalUrl = urlData.original_url;
        const expiresAt = new Date(urlData.expires_at);
        const currentTime = new Date();

        if (expiresAt < currentTime) {
            logEvent("redirect_failed", shortcode, { reason: "expired" });
            return res.status(410).json({ error: "Gone", message: "Short link has expired." });
        }

        const referrer = req.headers.referer || null;
        const ipAddress = getClientIp(req);
        const clickTimestamp = currentTime.toISOString();

        try {
            await dbRun(
                "INSERT INTO clicks (shortcode, timestamp, referrer, ip_address) VALUES (?, ?, ?, ?)",
                [shortcode, clickTimestamp, referrer, ipAddress]
            );
            logEvent("url_clicked", shortcode, {
                referrer: referrer,
                ip_address: ipAddress
            });
        } catch (clickErr) {
            console.error("Error logging click:", clickErr.message);
            logEvent("error", shortcode, { event: "click_log_failed", exception: clickErr.message });
        }

        return res.redirect(302, originalUrl);

    } catch (err) {
        console.error("Error during redirection:", err.message);
        logEvent("error", shortcode, { event: "redirect_error", exception: err.message });
        return res.status(500).json({ error: "Internal Server Error", message: "An unexpected error occurred." });
    }
};

exports.getShortUrlStats = async (req, res) => {
    const { shortcode } = req.params;

    try {
        const urlData = await dbGet("SELECT shortcode, original_url, created_at, expires_at FROM shortened_urls WHERE shortcode = ?", [shortcode]);

        if (!urlData) {
            logEvent("stats_retrieval_failed", shortcode, { reason: "not_found" });
            return res.status(404).json({ error: "Not Found", message: "Short link statistics not found." });
        }

        const clicksData = await dbAll("SELECT timestamp, referrer, ip_address FROM clicks WHERE shortcode = ?", [shortcode]);

        const detailedClicks = clicksData.map(click => ({
            timestamp: click.timestamp,
            referrer: click.referrer,
            location_ip: click.ip_address
        }));

        logEvent("stats_retrieved", shortcode, {
            total_clicks: detailedClicks.length,
            shortcode: urlData.shortcode
        });

        return res.status(200).json({
            shortcode: urlData.shortcode,
            original_url: urlData.original_url,
            creation_date: urlData.created_at,
            expiry_date: urlData.expires_at,
            total_clicks: detailedClicks.length,
            detailed_clicks: detailedClicks
        });

    } catch (err) {
        console.error("Error retrieving statistics:", err.message);
        logEvent("error", shortcode, { event: "stats_retrieval_error", exception: err.message });
        return res.status(500).json({ error: "Internal Server Error", message: "An unexpected error occurred while retrieving statistics." });
    }
};