// src/controllers/userLessonController.js
const db = require('../config/db');

// GET /api/user-lessons - Get all lesson tracking records for the logged-in user
const getUserLessons = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await db.query(
            `SELECT ul.*, l.title AS lesson_title
             FROM user_lesson ul
             JOIN lessons l ON ul.lesson_id = l.id
             WHERE ul.user_id = $1
             ORDER BY ul.last_entered DESC NULLS LAST`,
            [userId]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getUserLessons:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/user-lessons/:lessonId - Get tracking record for a specific lesson
const getUserLessonByLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;

        const result = await db.query(
            `SELECT ul.*, l.title AS lesson_title
             FROM user_lesson ul
             JOIN lessons l ON ul.lesson_id = l.id
             WHERE ul.user_id = $1 AND ul.lesson_id = $2`,
            [userId, lessonId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Tracking record not found for this lesson' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in getUserLessonByLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/user-lessons/:lessonId - Create a tracking record for a lesson
const createUserLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;
        const {
            time_spent,
            videos_watched_count,
            practice_completed,
            last_entered,
            quiz_score,
            exam_score,
        } = req.body;

        // P2-2: verify lesson exists AND belongs to this user (prevents cross-user tracking)
        const lessonCheck = await db.query(
            'SELECT id FROM lessons WHERE id = $1 AND user_id = $2',
            [lessonId, userId]
        );
        if (lessonCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        // Check if record already exists
        const existing = await db.query(
            'SELECT id FROM user_lesson WHERE user_id = $1 AND lesson_id = $2',
            [userId, lessonId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({
                message: 'Tracking record already exists for this lesson. Use PUT to update it.',
            });
        }

        const result = await db.query(
            `INSERT INTO user_lesson 
                (user_id, lesson_id, time_spent, videos_watched_count, practice_completed, last_entered, quiz_score, exam_score)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                userId,
                lessonId,
                // P3-2: cap numeric fields to sane ranges
                Math.min(Math.max(time_spent ?? 0, 0), 86400),          // 0–24h seconds
                Math.min(Math.max(videos_watched_count ?? 0, 0), 10000), // 0–10000
                practice_completed ?? false,
                last_entered ?? null,
                quiz_score != null ? Math.min(Math.max(quiz_score, 0), 100) : null,   // 0–100
                exam_score  != null ? Math.min(Math.max(exam_score, 0), 100)  : null, // 0–100
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error in createUserLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// PUT /api/user-lessons/:lessonId - Update a tracking record for a lesson
const updateUserLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;
        const {
            time_spent,
            videos_watched_count,
            practice_completed,
            last_entered,
            quiz_score,
            exam_score,
        } = req.body;

        // Build dynamic SET clause from provided fields only
        // time_spent and videos_watched_count are INCREMENTAL (+=)
        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (time_spent !== undefined) {
            // P3-2: cap time_spent increment at 24h
            const safeDuration = Math.min(Math.max(time_spent, 0), 86400);
            fields.push(`time_spent = time_spent + $${paramIndex++}`);
            values.push(safeDuration);
        }
        if (videos_watched_count !== undefined) {
            const safeCount = Math.min(Math.max(videos_watched_count, 0), 10000);
            // Cap at actual READY video count for this lesson so analytics never exceed 100%.
            // Pending generated videos (without file_path) are not watchable yet.
            fields.push(
                `videos_watched_count = LEAST(
                    videos_watched_count + $${paramIndex},
                    (
                        SELECT COUNT(*)
                        FROM lesson_files
                        WHERE lesson_id = $${paramIndex + 1}
                          AND type = 'video'
                          AND NULLIF(BTRIM(file_path), '') IS NOT NULL
                    )
                )`
            );
            values.push(safeCount, lessonId);
            paramIndex += 2;
        }
        if (practice_completed !== undefined) { fields.push(`practice_completed = $${paramIndex++}`); values.push(practice_completed); }
        if (last_entered !== undefined) { fields.push(`last_entered = $${paramIndex++}`); values.push(last_entered); }
        if (quiz_score !== undefined) { fields.push(`quiz_score = $${paramIndex++}`); values.push(Math.min(Math.max(quiz_score, 0), 100)); }
        if (exam_score !== undefined) { fields.push(`exam_score = $${paramIndex++}`); values.push(Math.min(Math.max(exam_score, 0), 100)); }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }

        values.push(userId, lessonId);

        const result = await db.query(
            `UPDATE user_lesson
             SET ${fields.join(', ')}
             WHERE user_id = $${paramIndex} AND lesson_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Tracking record not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in updateUserLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// DELETE /api/user-lessons/:lessonId - Delete a tracking record
const deleteUserLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;

        const result = await db.query(
            'DELETE FROM user_lesson WHERE user_id = $1 AND lesson_id = $2 RETURNING *',
            [userId, lessonId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Tracking record not found' });
        }

        res.status(200).json({ message: 'Tracking record deleted successfully' });
    } catch (error) {
        console.error('Error in deleteUserLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    getUserLessons,
    getUserLessonByLesson,
    createUserLesson,
    updateUserLesson,
    deleteUserLesson,
};
