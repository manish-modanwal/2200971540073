// src/app.js
const express = require('express');
const shortUrlRoutes = require('./routes/shortUrlRoutes');
const errorHandler = require('./middleware/errorHandler'); // Custom error handler
const logger = require('./middleware/logger'); // Custom logger middleware

const app = express();

app.use(express.json());
app.use(logger.requestLogger); // Example of request logging middleware

// Route for the main redirection (must be before specific /shorturls routes)
app.use('/:shortcode', shortUrlRoutes.redirect);

// Main API routes
app.use('/shorturls', shortUrlRoutes.api); // All /shorturls endpoints

// Global error handling middleware (should be last)
app.use(errorHandler);

module.exports = app;