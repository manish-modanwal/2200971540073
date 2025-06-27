// src/services/shortcodeService.js
const config = require('../config');

/**
 * Generates a unique random alphanumeric shortcode.
 * @param {sqlite3.Database} db - The database instance.
 * @param {number} length - The desired length of the shortcode.
 * @returns {Promise<string>} A promise that resolves with a unique shortcode.
 */
async function generateUniqueShortcode(db, length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let shortcode;
    let isUnique = false;

    while (!isUnique) {
        shortcode = Array.from({ length: length }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');

        const row = await new Promise((resolve, reject) => {
            db.get("SELECT 1 FROM shortened_urls WHERE shortcode = ?", [shortcode], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!row) {
            isUnique = true;
        }
    }
    return shortcode;
}

/**
 * Checks if a custom shortcode is alphanumeric and has reasonable length.
 * @param {string} shortcode - The shortcode to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isShortcodeValid(shortcode) {
    return /^[a-zA-Z0-9]+$/.test(shortcode) && shortcode.length >= 3 && shortcode.length <= 15;
}

/**
 * Tries to get the client's IP address, considering proxies.
 * @param {object} req - The Express request object.
 * @returns {string|undefined} The client's IP address.
 */
function getClientIp(req) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim();
    }
    return req.ip || req.connection.remoteAddress;
}

module.exports = { generateUniqueShortcode, isShortcodeValid, getClientIp };