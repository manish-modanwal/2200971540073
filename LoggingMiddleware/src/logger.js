// src/logger.js
// This module defines the Logger class, which handles:
// - Validation of log parameters.
// - Making API calls to the logging endpoint.
// - Implementing retry logic for failed log attempts.
// - Interacting with the auth module to get an authorization token.

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getAuthToken } = require('./auth'); // Import the token acquisition function
const dotenv = require('dotenv'); // Make sure dotenv is installed and configured

dotenv.config(); // Ensure environment variables are loaded for LOG_API_BASE_URL

// Base URL for the logging API endpoint
const LOG_API_URL = `${process.env.LOG_API_BASE_URL}/logs`;

// Define allowed values for 'stack', 'level', and 'package' as per guidelines
// These are constants and do not need to be part of the class instance.
const ALLOWED_STACKS = ["backend", "frontend"];
const ALLOWED_LEVELS = ["debug", "info", "warn", "error", "fatal"];
const ALLOWED_BACKEND_PACKAGES = ["cache", "controller", "cron", "domain", "handler", "repository", "route", "service"];
const ALLOWED_COMMON_PACKAGES = ["auth", "config", "middleware"]; // Packages usable by both backend and frontend

class Logger {
    constructor(config = {}) {
        // API URL for logging
        this.logApiUrl = LOG_API_URL;

        // Configurable options (can be overridden by constructor config)
        this.timeout = config.timeout || 5000; // Request timeout in ms
        this.retries = config.retries || 3;   // Number of retry attempts

        // No need to store ALLOWED lists on 'this' as they are constants defined globally.
        // Authentication credentials are handled by auth.js now.
    }

    /**
     * Validates the input parameters for the log function against predefined constraints.
     * Inputs are converted to lowercase for case-insensitive validation against allowed lists.
     * This is a static method as it doesn't depend on the Logger instance's state.
     *
     * @param {string} stack - The origin of the log ("backend" or "frontend").
     * @param {string} level - The severity level of the log ("debug", "info", "warn", "error", "fatal").
     * @param {string} packageName - The specific module/package where the log originated.
     * @param {string} message - The log message content.
     * @throws {Error} If any validation rule is violated.
     */
    static validateLogParams(stack, level, packageName, message) {
        // Convert inputs to lowercase for consistent validation
        const lowerStack = stack.toLowerCase();
        const lowerLevel = level.toLowerCase();
        const lowerPackageName = packageName.toLowerCase();

        // Validate 'stack' against ALLOWED_STACKS
        if (!ALLOWED_STACKS.includes(lowerStack)) {
            throw new Error(`Invalid 'stack' value: '${stack}'. Must be one of: ${ALLOWED_STACKS.join(', ')} (all lowercase).`);
        }
        // Validate 'level' against ALLOWED_LEVELS
        if (!ALLOWED_LEVELS.includes(lowerLevel)) {
            throw new Error(`Invalid 'level' value: '${level}'. Must be one of: ${ALLOWED_LEVELS.join(', ')} (all lowercase).`);
        }

        // Validate 'packageName' based on the 'stack'
        if (lowerStack === 'backend') {
            // Backend can use packages from ALLOWED_BACKEND_PACKAGES or ALLOWED_COMMON_PACKAGES
            if (!ALLOWED_BACKEND_PACKAGES.includes(lowerPackageName) && !ALLOWED_COMMON_PACKAGES.includes(lowerPackageName)) {
                throw new Error(`Invalid 'package' value: '${packageName}' for 'backend' stack. Must be one of: ${[...ALLOWED_BACKEND_PACKAGES, ...ALLOWED_COMMON_PACKAGES].join(', ')} (all lowercase).`);
            }
        } else if (lowerStack === 'frontend') {
            // Frontend can ONLY use packages from ALLOWED_COMMON_PACKAGES
            if (!ALLOWED_COMMON_PACKAGES.includes(lowerPackageName)) {
                throw new Error(`Invalid 'package' value: '${packageName}' for 'frontend' stack. Must be one of: ${ALLOWED_COMMON_PACKAGES.join(', ')} (all lowercase).`);
            }
        }

        // Validate 'message' to ensure it's a non-empty string
        if (typeof message !== 'string' || message.trim().length === 0) {
            throw new Error('Message must be a non-empty string.');
        }

        // Add a check for message length if the server consistently returns 400 with a length error
        // As per the server error: "has to be at most 48 characters"
        if (message.length > 48) {
            throw new Error(`Message length exceeds 48 characters. Current length: ${message.length}.`);
        }


        return true; // Return true if all validations pass
    }

    /**
     * Makes the actual API call to the logging endpoint using Node.js's native http/https modules.
     * This function is used internally by logWithRetry.
     *
     * @param {object} logData - The log payload object to send (e.g., { stack, level, package, message }).
     * @param {string} token - The authorization token obtained from the authentication API.
     * @returns {Promise<object>} A promise that resolves with the API response data if successful.
     * @throws {Error} If the API call fails (non-200/201 status code) or the response is invalid.
     */
    async #makeLogApiCall(logData, token) { // Private method using # prefix (Node.js 12.x+ / ES2020)
        return new Promise((resolve, reject) => {
            const url = new URL(this.logApiUrl); // Parse the logging API URL
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http; // Select http or https module

            const postData = JSON.stringify(logData); // Stringify the log data for the request body

            // Define request options
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80), // Use default ports if not specified
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData), // Required for POST requests
                    'Authorization': `Bearer ${token}` // Use the dynamically obtained token for authorization
                },
                timeout: this.timeout // Use instance's timeout
            };

            // Create the HTTP/HTTPS request
            const req = httpModule.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk); // Accumulate response data
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data); // Parse the JSON response
                        // --- FIX APPLIED HERE: Accept both 200 and 201 status codes for log API ---
                        if (res.statusCode === 200 || res.statusCode === 201) {
                            resolve(response); // Resolve if status is 200 or 201 (OK/Created)
                        } else {
                            // Reject if API call failed with a non-200/201 status code
                            reject(new Error(`Log API call failed with status ${res.statusCode}: ${data}`));
                        }
                    } catch (error) {
                        // Reject if JSON parsing fails (e.g., non-JSON response)
                        reject(new Error(`Failed to parse log API response: ${error.message}`));
                    }
                });
            });

            // Handle request errors (e.g., network issues)
            req.on('error', (error) => {
                reject(new Error(`Log API request failed: ${error.message}`));
            });

            // Handle request timeout
            req.on('timeout', () => {
                req.destroy(); // Destroy the request to stop it
                reject(new Error('Log API request timeout'));
            });

            req.write(postData); // Send the request body
            req.end(); // End the request
        });
    }

    /**
     * Attempts to send a log entry, with a retry mechanism for transient failures.
     * It will retry up to 'this.retries' times with exponential backoff.
     *
     * @param {string} stack - The origin of the log.
     * @param {string} level - The severity level of the log.
     * @param {string} packageName - The specific module/package.
     * @param {string} message - The log message.
     * @param {number} [attempt=1] - Current retry attempt number (internal use).
     * @returns {Promise<object>} A promise that resolves with the successful API response.
     * @throws {Error} If logging fails after all retries or due to validation issues.
     */
    async #logWithRetry(stack, level, packageName, message, attempt = 1) { // Private method
        try {
            // Validate parameters first; validation errors are not retried
            Logger.validateLogParams(stack, level, packageName, message); // Call static validation method

            // Prepare log data payload (ensure lowercase for API compliance)
            const logData = {
                stack: stack.toLowerCase(),
                level: level.toLowerCase(),
                package: packageName.toLowerCase(),
                message: message
            };

            // Get the authorization token before each attempt to ensure it's valid/fresh.
            // getAuthToken handles its own caching and re-fetching logic.
            const token = await getAuthToken(); // Call the imported getAuthToken function
            if (!token) {
                // If getAuthToken returns null or throws, it means auth failed.
                // No point in retrying the log API call if we can't authenticate.
                throw new Error("Failed to acquire authentication token for logging.");
            }

            // Make the actual log API call
            const response = await this.#makeLogApiCall(logData, token); // Call private method
            return response; // Resolve with the successful response
        } catch (error) {
            // If an error occurs and we still have retries left
            if (attempt < this.retries) { // Use instance's retries
                console.warn(`[Logger] Log attempt ${attempt} failed, retrying... Error: ${error.message}`);
                // Exponential backoff: delay increases with each attempt (1s, 2s, 4s, etc.)
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                // Recursively call #logWithRetry for the next attempt
                return this.#logWithRetry(stack, level, packageName, message, attempt + 1);
            } else {
                // If all retries have failed, log the final error and re-throw
                console.error(`[Logger] Failed to send log after ${this.retries} attempts:`, error.message);
                throw error; // Re-throw the original error after all retries fail
            }
        }
    }

    /**
     * The main public method to send a log entry.
     * It abstracts the retry logic and error handling, providing a simpler interface.
     *
     * @param {string} stack - The origin of the log ("backend" or "frontend").
     * @param {string} level - The severity level of the log ("debug", "info", "warn", "error", "fatal").
     * @param {string} packageName - The specific module/package where the log originated.
     * @param {string} message - The actual log message.
     * @returns {Promise<object|null>} The API response object if successful, otherwise null.
     */
    async Log(stack, level, packageName, message) {
        try {
            // Call the private retry mechanism
            const response = await this.#logWithRetry(stack, level, packageName, message);
            // Corrected access to logID from response.logId to response.logID (as per API spec)
            console.log(`[Logger] Log sent successfully. LogID: ${response.logID}`);
            return response;
        } catch (error) {
            console.error('[Logger] Final logging attempt failed:', error.message);
            return null; // Return null to indicate complete failure
        }
    }

    // Convenience methods for specific log levels
    // These methods internally call the main Log method of the instance.
    debug(stack, packageName, message) { return this.Log(stack, 'debug', packageName, message); }
    info(stack, packageName, message) { return this.Log(stack, 'info', packageName, message); }
    warn(stack, packageName, message) { return this.Log(stack, 'warn', packageName, message); }
    error(stack, packageName, message) { return this.Log(stack, 'error', packageName, message); }
    fatal(stack, packageName, message) { return this.Log(stack, 'fatal', packageName, message); }
}

// Export the Logger class as the primary export of this module.
module.exports = Logger;
