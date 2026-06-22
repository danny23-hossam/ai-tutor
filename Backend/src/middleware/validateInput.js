// src/middleware/validateInput.js
// Lightweight field-length and format validators used across controllers.
// MED-2: prevents unbounded string inputs from reaching the database.

/**
 * Validate a required string field.
 * Returns an error message string, or null if valid.
 */
function validateString(value, fieldName, { min = 1, max } = {}) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return `${fieldName} is required`;
    }
    const str = String(value).trim();
    if (str.length < min) {
        return `${fieldName} must be at least ${min} character${min !== 1 ? 's' : ''}`;
    }
    if (max && str.length > max) {
        return `${fieldName} must be ${max} characters or fewer`;
    }
    return null;
}

/**
 * Validate an optional string field (only validates length if a value is provided).
 */
function validateOptionalString(value, fieldName, { max } = {}) {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (max && str.length > max) {
        return `${fieldName} must be ${max} characters or fewer`;
    }
    return null;
}

/**
 * Validate an email address format.
 */
function validateEmail(value, fieldName = 'Email') {
    const err = validateString(value, fieldName, { max: 254 });
    if (err) return err;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value).trim())) {
        return `${fieldName} must be a valid email address`;
    }
    return null;
}

/**
 * Collect multiple validation errors and return the first one,
 * or null if all pass.
 * Usage: const err = firstError(validateString(...), validateEmail(...));
 */
function firstError(...checks) {
    for (const result of checks) {
        if (result) return result;
    }
    return null;
}

module.exports = { validateString, validateOptionalString, validateEmail, firstError };
