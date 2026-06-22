// src/controllers/studyDaysController.js
const db = require('../config/db');

const TZ = 'Africa/Cairo'; // Egypt timezone (UTC+2)

// Helper: get today's date in Cairo timezone
const cairoToday = `(NOW() AT TIME ZONE '${TZ}')::date`;

// POST /api/study-days/start — called on lesson mount
// Inserts today's row if not already present (idempotent, zero cost if already exists)
const startDay = async (req, res) => {
    try {
        const userId = req.user.userId;
        await db.query(
            `INSERT INTO study_days (user_id, study_date)
             VALUES ($1, ${cairoToday})
             ON CONFLICT (user_id, study_date) DO NOTHING`,
            [userId]
        );
        res.status(200).json({ message: 'Day started' });
    } catch (error) {
        console.error('Error in startDay:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// PUT /api/study-days/end — called on lesson unmount with duration in seconds
const endDay = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { duration } = req.body;

        // Ignore very short visits (accidental clicks)
        if (!duration || duration < 5) {
            return res.status(200).json({ message: 'Too short, skipped' });
        }
        // P2-1: cap at 24h (the physical maximum possible in one day).
        // This blocks overflow attacks (e.g. duration: 9999999999) while fully
        // recording any legitimate session, including extreme ones.
        const safeDuration = Math.min(duration, 86400);

        await db.query(
            `UPDATE study_days
             SET time_spent = time_spent + $1
             WHERE user_id = $2 AND study_date = ${cairoToday}`,
            [safeDuration, userId]
        );
        res.status(200).json({ message: 'Duration saved' });
    } catch (error) {
        console.error('Error in endDay:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/study-days/stats — home page stats (weekly time, lesson count, streak)
const getStats = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Saturday-based week start in Cairo timezone
        const weekStart = `
            ${cairoToday} - (
                (EXTRACT(DOW FROM ${cairoToday})::int + 1) % 7
            ) * INTERVAL '1 day'
        `;

        // 1. Weekly study time
        const weeklyRes = await db.query(
            `SELECT COALESCE(SUM(time_spent), 0) AS study_time_seconds
             FROM study_days
             WHERE user_id = $1
               AND study_date >= (${weekStart})::date`,
            [userId]
        );
        const studyTimeSeconds = Number(weeklyRes.rows[0].study_time_seconds);

        // 2. Lesson count — from lessons table (source of truth)
        const lessonRes = await db.query(
            `SELECT COUNT(*) AS lesson_count FROM lessons WHERE user_id = $1`,
            [userId]
        );
        const lessonCount = Number(lessonRes.rows[0].lesson_count);

        // 3. Day streak — walk backward from today counting consecutive days
        const daysRes = await db.query(
            `SELECT study_date
             FROM study_days
             WHERE user_id = $1 AND time_spent > 0
             ORDER BY study_date DESC`,
            [userId]
        );

        let streak = 0;
        if (daysRes.rows.length > 0) {
            // Use DB cairo today to avoid server timezone issues
            const todayRes = await db.query(`SELECT ${cairoToday} AS today`);
            const today = new Date(todayRes.rows[0].today);
            today.setHours(0, 0, 0, 0);

            const mostRecent = new Date(daysRes.rows[0].study_date);
            mostRecent.setHours(0, 0, 0, 0);

            const diffDays = Math.round((today - mostRecent) / 86400000);

            if (diffDays <= 1) {
                // Start counting from the most recent study day
                let expected = new Date(mostRecent);
                for (const row of daysRes.rows) {
                    const d = new Date(row.study_date);
                    d.setHours(0, 0, 0, 0);
                    const diff = Math.round((expected - d) / 86400000);
                    if (diff === 0) {
                        streak++;
                        expected.setDate(expected.getDate() - 1);
                    } else break;
                }
            }
            // diffDays > 1 → streak stays 0 (missed a day)
        }

        res.status(200).json({ studyTimeSeconds, lessonCount, streak });
    } catch (error) {
        console.error('Error in getStats:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = { startDay, endDay, getStats };
