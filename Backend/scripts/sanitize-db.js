require('dotenv').config({ path: '../.env' });
const db = require('../src/config/db');

async function sanitize() {
    try {
        console.log('Sanitizing user_lesson videos_watched_count...');
        const res = await db.query(`
            UPDATE user_lesson ul
            SET videos_watched_count = LEAST(
                ul.videos_watched_count,
                (SELECT COUNT(*) FROM lesson_files lf WHERE lf.lesson_id = ul.lesson_id AND lf.type = 'video')
            )
            RETURNING *;
        `);
        console.log(`Sanitized ${res.rowCount} rows.`);
    } catch (err) {
        console.error('Error sanitizing DB:', err);
    } finally {
        process.exit(0);
    }
}

sanitize();
