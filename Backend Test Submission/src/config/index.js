// src/config/index.js
module.exports = {
    databasePath: process.env.DATABASE_PATH || 'shortener.db',
    shortcodeLength: parseInt(process.env.SHORTCODE_LENGTH || '7', 10),
    defaultValidityMinutes: parseInt(process.env.DEFAULT_VALIDITY_MINUTES || '30', 10),
    hostname: process.env.HOSTNAME || "localhost:3000",
    port: process.env.PORT || 3000,
    urlRegex: new RegExp(
        /^(?:http|ftp)s?:\/\/(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9-]{2,}\.?)|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/?|[/?]\S+)$/,
        'i'
    )
};