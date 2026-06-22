// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { getUserProfile, getAllUsers, updateUserProfile, deleteUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// All user routes require authentication
router.use(protect);

// GET /api/users/profile - get logged-in user's profile
router.get('/profile', getUserProfile);

// GET /api/users - get all users
router.get('/', getAllUsers);

// PUT /api/users/profile - update logged-in user's own profile (name, email, password)
router.put('/profile', updateUserProfile);

// DELETE /api/users/:id - delete a user by ID
router.delete('/:id', deleteUser);

module.exports = router;
