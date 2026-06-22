// src/utils/logger.js
// LOW-2: Production-safe error logger.
//
// In development: logs the full error object (stack trace, query details) to aid debugging.
// In production:  logs only the error message — never the stack, never DB schema details
//                 that could leak sensitive info to log aggregators or monitoring dashboards.

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Log an error from a controller action.
 * @param {string} location  e.g. 'registerUser', 'streamFile'
 * @param {Error}  error     the caught error
 */
function logError(location, error) {
    if (IS_PROD) {
        console.error(`[ERROR] ${location}: ${error?.message ?? String(error)}`);
    } else {
        console.error(`[ERROR] ${location}:`, error);
    }
}

/**
 * Globally patch console.error in production so all existing controller calls
 * automatically strip stack traces without requiring individual file edits.
 * Call this once from app.js before any routes are loaded.
 */
function installProductionLogger() {
    if (!IS_PROD) return; // no-op in dev

    const _originalError = console.error.bind(console);
    console.error = (...args) => {
        // Sanitize any Error objects — log only the message, not the stack
        const sanitized = args.map((arg) =>
            arg instanceof Error ? `${arg.name}: ${arg.message}` : arg
        );
        _originalError(...sanitized);
    };
}

module.exports = { logError, installProductionLogger };
