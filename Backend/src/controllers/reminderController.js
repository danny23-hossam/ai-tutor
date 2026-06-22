// src/controllers/reminderController.js
const db = require('../config/db');
const { validateString } = require('../middleware/validateInput');

// GET /api/reminders - Get all reminders for the logged-in user
const getReminders = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await db.query(
            'SELECT * FROM reminders WHERE user_id = $1 ORDER BY remind_date ASC',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getReminders:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/reminders - Create a new reminder
const createReminder = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { remind_date, notes } = req.body;

        // MED-2: validate required fields and length limits
        if (!remind_date) {
            return res.status(400).json({ message: 'remind_date is required' });
        }
        // P2-2: validate ISO date format — prevents DB type errors from arbitrary strings
        const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/;
        if (!ISO_DATE_RE.test(remind_date)) {
            return res.status(400).json({ message: 'remind_date must be a valid date (YYYY-MM-DD or ISO 8601)' });
        }
        const err = validateString(notes, 'Notes', { min: 1, max: 1000 });
        if (err) return res.status(400).json({ message: err });

        const result = await db.query(
            'INSERT INTO reminders (user_id, remind_date, notes) VALUES ($1, $2, $3) RETURNING *',
            [userId, remind_date, notes]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error in createReminder:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// DELETE /api/reminders/:id - Delete a reminder
const deleteReminder = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Reminder not found' });
        }

        res.status(200).json({ message: 'Reminder deleted successfully' });
    } catch (error) {
        console.error('Error in deleteReminder:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = { getReminders, createReminder, deleteReminder };
