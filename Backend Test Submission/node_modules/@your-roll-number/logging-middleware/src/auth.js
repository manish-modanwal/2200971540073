// src/auth.js
// This module is responsible for fetching and caching the authorization token
// required to interact with the Test Server's log API.

const http = require('http');
const https = require('https');
const { URL } = require('url');
const dotenv = require('dotenv');

// Load environment variables from the .env file.
// Ensure you have a .env file at the root of your 'Logging Middleware' folder
// with the necessary credentials.
dotenv.config();

// Base URL for the authentication API, typically loaded from environment variables
const AUTH_URL = `${process.env.LOG_API_BASE_URL}/auth`;

let currentToken = null; // Stores the active authorization token
let tokenExpiryTime = 0; // Stores the Unix timestamp (seconds) when the token expires

/**
 * Fetches a new authorization token from the test server.
 * Caches the token and its expiry time to avoid unnecessary API calls.
 * It will re-fetch the token if the current one is expired or nearly expired (within 60 seconds).
 *
 * @returns {Promise<string>} A promise that resolves with the authorization token.
 * @throws {Error} If authentication fails, required environment variables are missing,
 * or the server response is invalid.
 */
async function getAuthToken() {
    const now = Math.floor(Date.now() / 1000); // Get current time in seconds

    // Check if a valid token already exists and hasn't expired (with a 60-second buffer for safety)
    if (currentToken && tokenExpiryTime > now + 60) {
        console.log('[Auth] Using cached authentication token.');
        return currentToken;
    }

    console.log('[Auth] Fetching new authentication token...');
    try {
        // Prepare the payload with credentials from environment variables
        const payload = {
            email: process.env.MY_EMAIL,
            name: process.env.MY_NAME,
            rollNo: process.env.MY_ROLL_NO,
            accessCode: process.env.MY_ACCESS_CODE,
            clientID: process.env.MY_CLIENT_ID,
            clientSecret: process.env.MY_CLIENT_SECRET,
        };

        // Validate that all required environment variables for authentication are present
        for (const key in payload) {
            if (!payload[key]) {
                throw new Error(`Missing environment variable for authentication: ${key.toUpperCase()}. Please ensure your .env file is correctly configured.`);
            }
        }

        // Parse the authentication URL to determine protocol (http/https) and host details
        const url = new URL(AUTH_URL);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http; // Use appropriate module based on protocol

        const postData = JSON.stringify(payload); // Convert payload to JSON string

        // Define request options for the HTTP/HTTPS call
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80), // Default ports for HTTPS (443) and HTTP (80)
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData), // Set content length for POST request
            },
            timeout: 5000 // Timeout for the request in milliseconds
        };

        // Execute the HTTP/HTTPS request and return a Promise
        const tokenResponse = await new Promise((resolve, reject) => {
            const req = httpModule.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk); // Accumulate response data
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data); // Parse the JSON response
                        // --- Accept both 200 and 201 status codes ---
                        if (res.statusCode === 200 || res.statusCode === 201) {
                            resolve(response); // Resolve with the parsed response if successful
                        } else {
                            // Reject if the server returned a non-200/201 status code
                            reject(new Error(`Auth API failed with status ${res.statusCode}: ${data}`));
                        }
                    } catch (error) {
                        // Reject if JSON parsing fails
                        reject(new Error(`Failed to parse auth response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => reject(new Error(`Auth request failed: ${error.message}`))); // Handle network errors
            req.on('timeout', () => {
                req.destroy(); // Destroy the request on timeout
                reject(new Error('Auth request timeout')); // Reject with timeout error
            });

            req.write(postData); // Send the request body
            req.end(); // End the request
        });

        // --- FIX APPLIED HERE: Correctly access 'access_token' and 'expires_in' ---
        if (tokenResponse && tokenResponse.access_token && tokenResponse.expires_in) {
            currentToken = tokenResponse.access_token;
            tokenExpiryTime = tokenResponse.expires_in; // Server provides expiry as a Unix timestamp
            console.log('[Auth] Successfully obtained new authorization token.');
            return currentToken;
        } else {
            // If response structure is unexpected
            throw new Error('Auth API response missing "access_token" or "expires_in" information.');
        }

    } catch (error) {
        // Log the detailed error for debugging purposes
        console.error('[Auth] Error obtaining authorization token:', error.message);
        // Re-throw the error for the calling function to handle
        throw new Error(`Authentication failed: ${error.message}`);
    }
}

// Export the function for use in other modules
module.exports = { getAuthToken };
