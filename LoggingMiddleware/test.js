// test.js
// This script is for testing the Logging Middleware locally.

// Import the Logger class directly from your middleware's main entry point
const Logger = require('./src/index'); // No .Logger needed anymore

// Instantiate the Logger. It will automatically pick up .env variables.
const myLogger = new Logger();

// --- Test Function ---
async function runLoggerTests() {
    console.log('--- Starting Logging Middleware Tests ---');

    // Test 1: Valid Backend Info Log
    console.log('\n--- Test 1: Valid Backend Info Log (Package: handler) ---');
    try {
        await myLogger.info('backend', 'handler', 'User login initiated successfully.');
    } catch (error) {
        console.error('Test 1 FAILED:', error.message);
    }

    // Test 2: Valid Frontend Debug Log (using a common package 'middleware')
    console.log('\n--- Test 2: Valid Frontend Debug Log (Package: middleware) ---');
    try {
        await myLogger.debug('frontend', 'middleware', 'Frontend UI component rendered.');
    } catch (error) {
        console.error('Test 2 FAILED:', error.message);
    }

    // test.js (Only the relevant change for Test 3)

// ... (rest of your test.js code)

// Test 3: Valid Backend Error Log with Service Package
console.log('\n--- Test 3: Valid Backend Error Log (Package: service) ---');
try {
    // Shortened message to be within 48 characters
    await myLogger.error('backend', 'service', 'DB connect failed; user retrieval problem.');
} catch (error) {
    console.error('Test 3 FAILED:', error.message);
}

// ... (rest of your test.js code)

    // --- Tests Expected to Fail Validation ---

    // Test 4: Invalid Stack Value (e.g., "server" instead of "backend"/"frontend")
    console.log('\n--- Test 4: Invalid Stack Value ("server") ---');
    try {
        await myLogger.info('server', 'config', 'Attempting to log from an invalid stack.');
    } catch (error) {
        console.error('Test 4 Caught Expected Error:', error.message);
    }

    // Test 5: Invalid Level Value (e.g., "verbose" instead of allowed levels)
    console.log('\n--- Test 5: Invalid Level Value ("verbose") ---');
    try {
        await myLogger.Log('backend', 'verbose', 'controller', 'Attempting to log with invalid level.');
    } catch (error) {
        console.error('Test 5 Caught Expected Error:', error.message);
    }

    // Test 6: Invalid Package for Backend (e.g., trying to use a frontend-only name if it existed)
    // Note: With current strict rules, this will be caught by the general invalid package name check
    // if you tried a package not in any ALLOWED_ lists.
    console.log('\n--- Test 6: Invalid Package ("api" - not allowed) for Backend Stack ---');
    try {
        await myLogger.warn('backend', 'api', 'Backend attempting to log with a package not in the allowed list.');
    } catch (error) {
        console.error('Test 6 Caught Expected Error:', error.message);
    }

    // Test 7: Invalid Package for Frontend (e.g., "repository" for frontend)
    console.log('\n--- Test 7: Invalid Package ("repository") for Frontend Stack ---');
    try {
        await myLogger.fatal('frontend', 'repository', 'Frontend attempting to log with a backend-only package.');
    } catch (error) {
        console.error('Test 7 Caught Expected Error:', error.message);
    }

    // Test 8: Empty Message
    console.log('\n--- Test 8: Empty Message ---');
    try {
        await myLogger.debug('backend', 'route', '');
    } catch (error) {
        console.error('Test 8 Caught Expected Error:', error.message);
    }

    console.log('\n--- Logging Middleware Tests Finished ---');
}

// Run the tests
runLoggerTests();