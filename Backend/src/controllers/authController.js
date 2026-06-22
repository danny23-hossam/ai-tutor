// src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { validateString, validateEmail, firstError } = require('../middleware/validateInput');
const { logError } = require('../utils/logger');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailer');

// P3-3: Pre-computed dummy hash to prevent login timing oracle.
// By always running ONE bcrypt.compare (against this when user not found),
// both the 'user not found' and 'wrong password' paths take the same time.
// Generated once at startup — zero per-request overhead.
let DUMMY_HASH;
(async () => { DUMMY_HASH = await bcrypt.hash('__timing_guard__', 10); })();

// MED-3: HttpOnly cookie options — JS cannot read this cookie at all.
// Production (Vercel → Render cross-origin):
//   - secure: true   → only sent over HTTPS
//   - sameSite: 'none' → required for cross-origin (different domains)
// Development (localhost):
//   - secure: false  → works over http
//   - sameSite: 'lax' → works for same-origin dev proxy
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: IS_PROD,                      // HTTPS only in prod
    sameSite: IS_PROD ? 'none' : 'lax',  // cross-origin in prod, relaxed in dev
    maxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days
    path: '/',
};

const registerUser = async (req, res) => {
    try {
        // 1. Extract data
        const { full_name, email, password } = req.body;

        // 2. Validation (MED-2)
        const validationError = firstError(
            validateString(full_name, 'Full name', { min: 2, max: 100 }),
            validateEmail(email),
            validateString(password,  'Password',  { min: 8, max: 128 })
        );
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        // 3. Check if user already exists
        const userExists = await db.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
        let existingUnverifiedUserId = null;
        
        if (userExists.rows.length > 0) {
            if (userExists.rows[0].is_verified) {
                // Email enumeration is mitigated by the auth rate limiter (10 req/15min).
                // Without an email verification flow, a clear message is the better UX tradeoff.
                return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
            } else {
                existingUnverifiedUserId = userExists.rows[0].id;
            }
        }

        // 4. Hash the password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 5. Generate a secure verification token
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // 6. Insert or update the user (unverified until they click the link)
        if (existingUnverifiedUserId) {
            await db.query(
                `UPDATE users 
                 SET full_name = $1, password_hash = $2, verify_token = $3, verify_token_expires = $4 
                 WHERE id = $5`,
                [full_name, password_hash, verifyToken, verifyExpires, existingUnverifiedUserId]
            );
        } else {
            await db.query(
                `INSERT INTO users (full_name, email, password_hash, is_verified, verify_token, verify_token_expires)
                 VALUES ($1, $2, $3, FALSE, $4, $5)`,
                [full_name, email, password_hash, verifyToken, verifyExpires]
            );
        }

        // 7. Send verification email (fire-and-forget — don't block the response)
        sendVerificationEmail(email, full_name, verifyToken).catch((err) => {
            logError('sendVerificationEmail', err);
        });

        res.status(201).json({
            message: 'Account created! Please check your email to verify your account before signing in.',
        });

    } catch (error) {
        logError('registerUser', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


const loginUser = async (req, res) => {
    try {
        // 1. Extract email and password
        const { email, password } = req.body;

        // 2. Validation
        const validationError = firstError(
            validateEmail(email),
            validateString(password, 'Password', { min: 1, max: 128 })
        );
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        // 3. Look up user by email
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows.length > 0 ? result.rows[0] : null;

        // P3-3: Always run bcrypt.compare — even if user not found.
        // This ensures 'invalid email' and 'wrong password' paths take identical time,
        // preventing attackers from enumerating valid emails via response timing.
        const hashToCheck = user ? user.password_hash : DUMMY_HASH;
        const isMatch = await bcrypt.compare(password, hashToCheck);

        if (!user || !isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // 5a. Block login if email not verified
        if (!user.is_verified) {
            return res.status(403).json({
                message: 'Please verify your email before signing in. Check your inbox for the verification link.',
                unverified: true,
            });
        }

        // 5. Generate JWT
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 6. MED-3: set HttpOnly cookie
        res.cookie('authToken', token, COOKIE_OPTIONS);

        // Return user info only — no token in body
        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
            },
        });

    } catch (error) {
        logError('loginUser', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/auth/logout — clears the HttpOnly cookie server-side
const logoutUser = (req, res) => {
    res.clearCookie('authToken', { ...COOKIE_OPTIONS, maxAge: 0 });
    res.status(200).json({ message: 'Logged out successfully' });
};

// GET /api/auth/verify-email?token=xxx — activate account from email link
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ message: 'Verification token is required' });
        }

        // Find user with this token that hasn't expired
        const result = await db.query(
            `SELECT id, is_verified FROM users
             WHERE verify_token = $1 AND verify_token_expires > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: 'Verification link is invalid or has expired. Please register again.',
                expired: true,
            });
        }

        const user = result.rows[0];

        if (user.is_verified) {
            return res.status(200).json({ message: 'Email already verified. You can sign in.' });
        }

        // Mark account as verified and clear the token
        await db.query(
            `UPDATE users
             SET is_verified = TRUE, verify_token = NULL, verify_token_expires = NULL
             WHERE id = $1`,
            [user.id]
        );

        res.status(200).json({ message: 'Email verified successfully! You can now sign in.' });

    } catch (error) {
        logError('verifyEmail', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/auth/forgot-password — send a password reset link by email
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const emailErr = validateEmail(email);
        if (emailErr) return res.status(400).json({ message: emailErr });

        // Always return the same response — prevents email enumeration.
        // (An attacker can't tell if the email is registered by the response.)
        const SAFE_RESPONSE = { message: "If this email is registered, you'll receive a reset link shortly." };

        const result = await db.query('SELECT id, full_name, is_verified FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(200).json(SAFE_RESPONSE);
        }

        const user = result.rows[0];

        // Generate a secure 1-hour token
        const resetToken   = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.query(
            'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
            [resetToken, resetExpires, user.id]
        );

        sendPasswordResetEmail(email, user.full_name, resetToken).catch((err) => {
            logError('sendPasswordResetEmail', err);
        });

        res.status(200).json(SAFE_RESPONSE);

    } catch (error) {
        logError('forgotPassword', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/auth/reset-password — set a new password using a valid reset token
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ message: 'Reset token is required' });
        }

        const passErr = validateString(password, 'Password', { min: 8, max: 128 });
        if (passErr) return res.status(400).json({ message: passErr });

        // Find user with a valid (non-expired) token
        const result = await db.query(
            `SELECT id FROM users
             WHERE reset_token = $1 AND reset_token_expires > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: 'Reset link is invalid or has expired. Please request a new one.',
                expired: true,
            });
        }

        const userId = result.rows[0].id;

        // Hash the new password and clear the token
        const password_hash = await bcrypt.hash(password, 10);
        await db.query(
            `UPDATE users
             SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL
             WHERE id = $2`,
            [password_hash, userId]
        );

        res.status(200).json({ message: 'Password updated successfully. You can now sign in.' });

    } catch (error) {
        logError('resetPassword', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    verifyEmail,
    forgotPassword,
    resetPassword,
};