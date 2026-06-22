// src/routes/reminderRoutes.js
const express = require('express');
const router = express.Router();
const { getReminders, createReminder, deleteReminder } = require('../controllers/reminderController');
const { protect } = require('../middleware/authMiddleware');

// All reminder routes require authentication
router.use(protect);

// GET /api/reminders
router.get('/', getReminders);

// POST /api/reminders
router.post('/', createReminder);

// DELETE /api/reminders/:id
router.delete('/:id', deleteReminder);

module.exports = router;
