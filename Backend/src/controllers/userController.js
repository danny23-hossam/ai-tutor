// src/controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcrypt');
const { validateString, validateEmail, validateOptionalString } = require('../middleware/validateInput');
const { logError } = require('../utils/logger');

// GET /api/users/profile - Get the logged-in user's profile
const getUserProfile = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await db.query(
            'SELECT id, full_name, email, created_at FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        logError('getUserProfile', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/users - Get all users
// ⛔ DISABLED: No admin role system exists yet.
// Returning all user emails to any authenticated user is a privacy/GDPR violation.
// Re-enable only after implementing a proper `isAdmin` middleware.
const getAllUsers = async (req, res) => {
    return res.status(403).json({
        message: 'Forbidden: this endpoint is restricted to administrators.',
    });
};

// PUT /api/users/profile - Update the logged-in user's own profile
const updateUserProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { full_name, email, password } = req.body;

        // MED-2: validate lengths before touching the DB
        if (full_name !== undefined) {
            const err = validateString(full_name, 'Full name', { min: 2, max: 100 });
            if (err) return res.status(400).json({ message: err });
        }
        if (email !== undefined) {
            const err = validateEmail(email);
            if (err) return res.status(400).json({ message: err });
        }
        if (password !== undefined) {
            const err = validateString(password, 'Password', { min: 8, max: 128 });
            if (err) return res.status(400).json({ message: err });
        }

        // Build dynamic SET clause from provided fields
        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (full_name !== undefined) {
            fields.push(`full_name = $${paramIndex++}`);
            values.push(full_name.trim());
        }
        if (email !== undefined) {
            // Check if email is already taken by another user
            const emailCheck = await db.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email.trim(), userId]
            );
            if (emailCheck.rows.length > 0) {
                return res.status(409).json({ message: 'Email is already in use by another account' });
            }
            fields.push(`email = $${paramIndex++}`);
            values.push(email.trim());
        }
        if (password !== undefined) {
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);
            fields.push(`password_hash = $${paramIndex++}`);
            values.push(password_hash);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }

        values.push(userId);

        const result = await db.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id, full_name, email, created_at`,
            values
        );

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in updateUserProfile:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// DELETE /api/users/:id - Delete a user by ID
// Users may only delete their own account.
const deleteUser = async (req, res) => {
    try {
        const requestingUserId = req.user.userId;
        const targetId = parseInt(req.params.id, 10);

        // CRIT-3: Enforce self-only deletion — no admin bypasses yet
        if (requestingUserId !== targetId) {
            return res.status(403).json({ message: 'Forbidden: you can only delete your own account.' });
        }

        const result = await db.query(
            'DELETE FROM users WHERE id = $1 RETURNING id, full_name, email',
            [targetId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error in deleteUser:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = { getUserProfile, getAllUsers, updateUserProfile, deleteUser };