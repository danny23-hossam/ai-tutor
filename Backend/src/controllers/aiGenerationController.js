// src/controllers/aiGenerationController.js
const db = require('../config/db');

// GET /api/ai-generations - Get all AI generations for the logged-in user
const getAiGenerations = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { type } = req.query; // Optional filter: ?type=summary|quiz|exam

        let query = `
            SELECT ag.*, l.title AS lesson_title
            FROM ai_generations ag
            JOIN lessons l ON ag.lesson_id = l.id
            WHERE ag.user_id = $1
        `;
        const values = [userId];

        if (type) {
            query += ` AND ag.type = $2`;
            values.push(type);
        }

        query += ` ORDER BY ag.created_at DESC`;

        const result = await db.query(query, values);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getAiGenerations:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/ai-generations/lesson/:lessonId - Get all AI generations for a specific lesson
const getAiGenerationsByLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;
        const { type } = req.query; // Optional filter: ?type=summary|quiz|exam

        let query = `
            SELECT ag.*, l.title AS lesson_title
            FROM ai_generations ag
            JOIN lessons l ON ag.lesson_id = l.id
            WHERE ag.user_id = $1 AND ag.lesson_id = $2
        `;
        const values = [userId, lessonId];

        if (type) {
            query += ` AND ag.type = $3`;
            values.push(type);
        }

        query += ` ORDER BY ag.created_at DESC`;

        const result = await db.query(query, values);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getAiGenerationsByLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/ai-generations/:id - Get a single AI generation by ID
const getAiGenerationById = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const result = await db.query(
            `SELECT ag.*, l.title AS lesson_title
             FROM ai_generations ag
             JOIN lessons l ON ag.lesson_id = l.id
             WHERE ag.id = $1 AND ag.user_id = $2`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'AI generation not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in getAiGenerationById:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/ai-generations - Create a new AI generation record
const createAiGeneration = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id, type, content } = req.body;

        // Validation
        if (!lesson_id || !type || !content) {
            return res.status(400).json({ message: 'lesson_id, type, and content are required' });
        }

        const validTypes = ['summary', 'quiz', 'exam'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: `type must be one of: ${validTypes.join(', ')}` });
        }

        // P2-1: verify lesson exists AND belongs to this user (prevents cross-user linking)
        const lessonCheck = await db.query(
            'SELECT id FROM lessons WHERE id = $1 AND user_id = $2',
            [lesson_id, userId]
        );
        if (lessonCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        const result = await db.query(
            `INSERT INTO ai_generations (user_id, lesson_id, type, content)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, lesson_id, type, content]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error in createAiGeneration:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// PUT /api/ai-generations/:id - Update an AI generation
const updateAiGeneration = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { type, content } = req.body;

        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (type !== undefined) {
            const validTypes = ['summary', 'quiz', 'exam'];
            if (!validTypes.includes(type)) {
                return res.status(400).json({ message: `type must be one of: ${validTypes.join(', ')}` });
            }
            fields.push(`type = $${paramIndex++}`);
            values.push(type);
        }

        if (content !== undefined) {
            fields.push(`content = $${paramIndex++}`);
            values.push(content);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }

        values.push(id, userId);

        const result = await db.query(
            `UPDATE ai_generations
             SET ${fields.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'AI generation not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in updateAiGeneration:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// DELETE /api/ai-generations/:id - Delete an AI generation
const deleteAiGeneration = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM ai_generations WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'AI generation not found' });
        }

        res.status(200).json({ message: 'AI generation deleted successfully' });
    } catch (error) {
        console.error('Error in deleteAiGeneration:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// ── AI Generation Trigger ─────────────────────────────────────────
// POST /api/ai-generations/trigger
// Orchestrates: fetch source text → call FastAPI → store results
const aiService = require('../services/aiService');
const drive = require('../config/googleDrive');

/**
 * Extract the Google Drive file ID from a stored URL.
 */
function extractDriveFileId(url) {
    if (!url) return null;
    try {
        const idParam = new URL(url).searchParams.get('id');
        if (idParam) return idParam;
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

/**
 * Download text content from a Google Drive file.
 * For PDFs/images, the AI team's OCR will handle extraction.
 * For text files, we read directly.
 */
async function getFileTextFromDrive(driveFileId) {
    try {
        const res = await drive.files.get(
            { fileId: driveFileId, alt: 'media' },
            { responseType: 'arraybuffer', timeout: 30000 }
        );
        // Return as buffer — caller decides how to use it
        return Buffer.from(res.data);
    } catch (err) {
        console.error('[trigger] Failed to download file from Drive:', err.message);
        return null;
    }
}

const triggerAiGeneration = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id, types, source_file_ids } = req.body;

        // Validation
        if (!lesson_id) {
            return res.status(400).json({ message: 'lesson_id is required' });
        }

        const validTypes = ['summary', 'quiz', 'exam'];
        // P3-1: deduplicate so ['summary','summary','summary'] only triggers one AI call
        const requestedTypes = [...new Set(
            Array.isArray(types) ? types.filter(t => validTypes.includes(t)) : ['summary']
        )];

        if (requestedTypes.length === 0) {
            return res.status(400).json({ message: `types must include at least one of: ${validTypes.join(', ')}` });
        }

        // Check if AI service is available
        const aiReady = await aiService.isAvailable();
        if (!aiReady) {
            // P3-1: never expose the internal service URL to the client in production
            const body = { message: 'AI service is not available. Please try again later.' };
            if (process.env.NODE_ENV !== 'production') {
                body.hint = `Expected at ${aiService.AI_API_URL}`;
            }
            return res.status(503).json(body);
        }

        // Get source files from DB
        let sourceText = '';

        if (source_file_ids && source_file_ids.length > 0) {
            // P3-2: cap the array to prevent huge SQL IN clauses (DoS via large arrays)
            const safeIds = source_file_ids.slice(0, 50);
            const placeholders = safeIds.map((_, i) => `$${i + 3}`).join(',');
            const filesResult = await db.query(
                `SELECT * FROM lesson_files
                 WHERE lesson_id = $1 AND user_id = $2 AND id IN (${placeholders})
                 ORDER BY created_at ASC`,
                [lesson_id, userId, ...safeIds]
            );

            // For now, we send the file IDs to the AI service
            // The AI team's OCR has already processed these files
            // and stored the text in their vector DB.
            // We just need to tell the AI which lesson to use.
            for (const file of filesResult.rows) {
                const driveId = extractDriveFileId(file.file_path);
                if (driveId) {
                    // The AI team's vector DB already has OCR text for this lesson
                    // We just need any text to pass — the vector DB handles retrieval
                }
            }
        }

        // Call AI service for each requested type and store results
        const results = {};

        for (const type of requestedTypes) {
            // Check if already generated (skip if exists)
            const existing = await db.query(
                `SELECT id FROM ai_generations
                 WHERE user_id = $1 AND lesson_id = $2 AND type = $3`,
                [userId, lesson_id, type]
            );

            let content = null;

            if (type === 'summary') {
                const result = await aiService.callSummarize(sourceText, String(userId), String(lesson_id));
                content = typeof result === 'string' ? result : JSON.stringify(result);
            } else if (type === 'quiz') {
                const result = await aiService.callFlipCards(sourceText, String(userId), String(lesson_id));
                content = result ? JSON.stringify(result) : null;
            } else if (type === 'exam') {
                const result = await aiService.callQuestions(sourceText, String(userId), String(lesson_id));
                content = result ? JSON.stringify(result) : null;
            }

            if (content) {
                if (existing.rows.length > 0) {
                    // Update existing record
                    await db.query(
                        `UPDATE ai_generations SET content = $1 WHERE id = $2`,
                        [content, existing.rows[0].id]
                    );
                    results[type] = { status: 'updated', id: existing.rows[0].id };
                } else {
                    // Insert new record
                    const insertResult = await db.query(
                        `INSERT INTO ai_generations (user_id, lesson_id, type, content)
                         VALUES ($1, $2, $3, $4) RETURNING id`,
                        [userId, lesson_id, type, content]
                    );
                    results[type] = { status: 'created', id: insertResult.rows[0].id };
                }
            } else {
                results[type] = { status: 'failed', error: 'AI service returned no content' };
            }
        }

        res.status(200).json({
            message: 'AI generation complete',
            results,
        });

    } catch (error) {
        console.error('Error in triggerAiGeneration:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/ai-generations/status/:lessonId
// Returns which content types exist for a lesson
const getAiGenerationStatus = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;

        const result = await db.query(
            `SELECT type, id, created_at FROM ai_generations
             WHERE user_id = $1 AND lesson_id = $2
             ORDER BY type ASC`,
            [userId, lessonId]
        );

        const status = {
            summary: null,
            quiz: null,
            exam: null,
        };

        for (const row of result.rows) {
            status[row.type] = {
                id: row.id,
                generated_at: row.created_at,
            };
        }

        // Check if AI service is reachable
        const aiAvailable = await aiService.isAvailable();

        res.status(200).json({
            ...status,
            ai_service_available: aiAvailable,
        });
    } catch (error) {
        console.error('Error in getAiGenerationStatus:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    getAiGenerations,
    getAiGenerationsByLesson,
    getAiGenerationById,
    createAiGeneration,
    updateAiGeneration,
    deleteAiGeneration,
    triggerAiGeneration,
    getAiGenerationStatus,
};
