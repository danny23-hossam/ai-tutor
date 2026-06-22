// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { registerUser, loginUser, logoutUser, verifyEmail, forgotPassword, resetPassword } = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', registerUser);

// POST /api/auth/login
router.post('/login', loginUser);

// POST /api/auth/logout — clears the HttpOnly auth cookie
router.post('/logout', logoutUser);

// GET /api/auth/verify-email?token=xxx — confirms email from the link
router.get('/verify-email', verifyEmail);

// POST /api/auth/forgot-password — sends a password reset email
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password — sets a new password from reset token
router.post('/reset-password', resetPassword);

module.exports = router;