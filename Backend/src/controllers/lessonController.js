// src/controllers/lessonController.js
const db = require('../config/db');
const { validateString } = require('../middleware/validateInput');

// GET /api/lessons - Get all lessons for the logged-in user
const getAllLessons = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await db.query(
            'SELECT * FROM lessons WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getAllLessons:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/lessons/:id - Get a single lesson by ID
const getLessonById = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const result = await db.query(
            'SELECT * FROM lessons WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in getLessonById:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/lessons - Create a new lesson
const createLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { title } = req.body;

        const err = validateString(title, 'Title', { min: 1, max: 200 });
        if (err) return res.status(400).json({ message: err });

        const result = await db.query(
            'INSERT INTO lessons (title, user_id) VALUES ($1, $2) RETURNING *',
            [title, userId]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error in createLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// PUT /api/lessons/:id - Update a lesson
const updateLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { title } = req.body;

        const err = validateString(title, 'Title', { min: 1, max: 200 });
        if (err) return res.status(400).json({ message: err });

        const result = await db.query(
            'UPDATE lessons SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [title, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in updateLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// DELETE /api/lessons/:id - Delete a lesson
const deleteLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM lessons WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        res.status(200).json({ message: 'Lesson deleted successfully' });
    } catch (error) {
        console.error('Error in deleteLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    getAllLessons,
    getLessonById,
    createLesson,
    updateLesson,
    deleteLesson,
};
