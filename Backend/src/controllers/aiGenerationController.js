// src/controllers/aiGenerationController.js
const db = require('../config/db');
const aiService = require('../services/aiService');

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

// ── AI Generation Trigger ─────────────────────────────────────────────────
// POST /api/ai-generations/trigger
//
// Orchestrates the full AI generation pipeline:
//   1. Get the most recent uploaded file(s) for the lesson (these were already
//      OCR'd and chunked into the vector DB when they were uploaded).
//   2. Call the appropriate pipeline endpoint for each requested type.
//   3. Transform the pipeline response format to what the frontend expects.
//   4. Upsert the result into the ai_generations table.
//
// ID mapping:
//   users.id        → pipeline: user_id     (string)
//   lesson_files.id → pipeline: document_id (string)
//   lessons.id      → pipeline: lesson_id   (string)

const triggerAiGeneration = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id, types } = req.body;

        // Validation
        if (!lesson_id) {
            return res.status(400).json({ message: 'lesson_id is required' });
        }

        const validTypes = ['summary', 'quiz', 'exam'];
        // Deduplicate so ['summary','summary'] only triggers one AI call
        const requestedTypes = [...new Set(
            Array.isArray(types) ? types.filter(t => validTypes.includes(t)) : ['summary']
        )];

        if (requestedTypes.length === 0) {
            return res.status(400).json({ message: `types must include at least one of: ${validTypes.join(', ')}` });
        }

        // Check if AI pipeline is reachable
        const aiReady = await aiService.isAvailable();
        if (!aiReady) {
            const body = { message: 'AI pipeline is not available. Please try again later.' };
            if (process.env.NODE_ENV !== 'production') {
                body.hint = `Expected pipeline at ${aiService.AI_API_URL}`;
            }
            return res.status(503).json(body);
        }

        // Get the uploaded files for this lesson so we can pass document_id to the pipeline.
        // We use the MOST RECENTLY UPLOADED file as the primary document source.
        // The pipeline already has its text in the vector DB (from the upload step).
        const filesResult = await db.query(
            `SELECT id, name FROM lesson_files
             WHERE lesson_id = $1 AND user_id = $2 AND type = 'upload'
             ORDER BY created_at DESC`,
            [lesson_id, userId]
        );

        if (filesResult.rows.length === 0) {
            return res.status(400).json({
                message: 'No uploaded files found for this lesson. Upload at least one PDF first.'
            });
        }

        // Use the most recently uploaded file as the primary document
        const primaryFile = filesResult.rows[0];
        const documentId = String(primaryFile.id);

        // Call AI pipeline for each requested type and store results
        const results = {};

        for (const type of requestedTypes) {
            let content = null;

            if (type === 'summary') {
                const summaryText = await aiService.callPipelineSummary(
                    String(userId), documentId, String(lesson_id)
                );
                content = summaryText; // stored as plain text/HTML
            } else if (type === 'quiz') {
                const flashcards = await aiService.callPipelineFlashcards(
                    String(userId), documentId, String(lesson_id)
                );
                // Store as JSON string — QuizFlashcards.jsx does JSON.parse(content)
                content = flashcards ? JSON.stringify(flashcards) : null;
            } else if (type === 'exam') {
                const questions = await aiService.callPipelineQuestions(
                    String(userId), documentId, String(lesson_id)
                );
                // Store as JSON string — ExamStart.jsx does JSON.parse(content)
                content = questions ? JSON.stringify(questions) : null;
            }

            if (content) {
                // Check if a record already exists for this lesson + type
                const existing = await db.query(
                    `SELECT id FROM ai_generations
                     WHERE user_id = $1 AND lesson_id = $2 AND type = $3`,
                    [userId, lesson_id, type]
                );

                if (existing.rows.length > 0) {
                    // Update existing record
                    await db.query(
                        `UPDATE ai_generations SET content = $1, created_at = NOW()
                         WHERE id = $2`,
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
                results[type] = {
                    status: 'failed',
                    error: 'AI pipeline returned no content. Ensure the file was uploaded and processed.',
                };
            }
        }

        res.status(200).json({
            message: 'AI generation complete',
            document_id: documentId,
            results,
        });

    } catch (error) {
        console.error('Error in triggerAiGeneration:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/ai-generations/status/:lessonId
// Returns which content types exist for a lesson + whether AI pipeline is available
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

        // Check if AI pipeline is reachable
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

// ── AI Tutor Chat ─────────────────────────────────────────────────────────
// POST /api/ai-generations/chat
//
// Uses RAG (Retrieval-Augmented Generation) to answer questions grounded in
// the lesson's uploaded documents. The pipeline searches its vector DB for
// relevant chunks and generates a contextual answer.

const chatWithAi = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id, message } = req.body;

        if (!lesson_id || !message) {
            return res.status(400).json({ message: 'lesson_id and message are required' });
        }

        if (typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ message: 'message must be a non-empty string' });
        }

        // Cap message length to prevent abuse
        if (message.length > 1000) {
            return res.status(400).json({ message: 'message must be 1000 characters or fewer' });
        }

        // Verify lesson belongs to this user
        const lessonCheck = await db.query(
            'SELECT id FROM lessons WHERE id = $1 AND user_id = $2',
            [lesson_id, userId]
        );
        if (lessonCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        // Get the most recently uploaded file for this lesson to use as document context.
        // The pipeline's RAG retrieves relevant chunks from its vector DB using document_id.
        const filesResult = await db.query(
            `SELECT id FROM lesson_files
             WHERE lesson_id = $1 AND user_id = $2 AND type = 'upload'
             ORDER BY created_at DESC LIMIT 1`,
            [lesson_id, userId]
        );

        if (filesResult.rows.length === 0) {
            return res.status(404).json({
                message: 'No uploaded files found for this lesson. Upload at least one PDF to enable AI chat.'
            });
        }

        const documentId = String(filesResult.rows[0].id);

        // Check AI pipeline availability
        const aiReady = await aiService.isAvailable();
        if (!aiReady) {
            return res.status(503).json({
                message: 'AI service is not available right now. Please try again later.',
            });
        }

        // Call the pipeline RAG endpoint
        const answer = await aiService.callPipelineAsk(
            String(userId),
            documentId,
            String(lesson_id),
            message.trim()
        );

        res.status(200).json({
            reply: answer || 'I could not generate a response for that question. Please try rephrasing.',
        });

    } catch (error) {
        console.error('Error in chatWithAi:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// ── Audio Generation ──────────────────────────────────────────────────────
// POST /api/ai-generations/audio
//
// Generates a TTS audio lesson from the most recently uploaded file.
// Calls the pipeline, retrieves the WAV bytes, uploads them to Google Drive,
// and updates (or creates) the lesson_files record with the Drive URL.

const drive = require('../config/googleDrive');
const { Readable } = require('stream');

function bufferToStream(buffer) {
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    return readable;
}

const generateAudio = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id, file_record_id, language = 'ar' } = req.body;

        if (!lesson_id) {
            return res.status(400).json({ message: 'lesson_id is required' });
        }

        // Verify lesson ownership
        const lessonCheck = await db.query(
            'SELECT id, title FROM lessons WHERE id = $1 AND user_id = $2',
            [lesson_id, userId]
        );
        if (lessonCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        // Get the source file to use as document context
        const filesResult = await db.query(
            `SELECT id FROM lesson_files
             WHERE lesson_id = $1 AND user_id = $2 AND type = 'upload'
             ORDER BY created_at DESC LIMIT 1`,
            [lesson_id, userId]
        );
        if (filesResult.rows.length === 0) {
            return res.status(400).json({
                message: 'No uploaded files found. Upload at least one PDF to generate audio.'
            });
        }
        const documentId = String(filesResult.rows[0].id);

        // Check pipeline availability
        const aiReady = await aiService.isAvailable();
        if (!aiReady) {
            return res.status(503).json({ message: 'AI pipeline is not available. Please try again later.' });
        }

        // Call pipeline to generate TTS audio (returns a WAV Buffer)
        const audioBuffer = await aiService.callPipelineAudio(
            String(userId), documentId, String(lesson_id), language
        );

        if (!audioBuffer || audioBuffer.length === 0) {
            return res.status(502).json({
                message: 'AI pipeline failed to generate audio. Please try again later.'
            });
        }

        // Upload the WAV to Google Drive
        const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const audioFilename = `audio_lesson_${lesson_id}_${language}_${Date.now()}.wav`;

        let driveFileId = null;
        try {
            const driveRes = await drive.files.create({
                requestBody: {
                    name: audioFilename,
                    parents: [ROOT_FOLDER_ID],
                    mimeType: 'audio/wav',
                },
                media: {
                    mimeType: 'audio/wav',
                    body: bufferToStream(audioBuffer),
                },
                fields: 'id',
            });
            driveFileId = driveRes.data.id;
        } catch (driveErr) {
            console.error('[generateAudio] Google Drive upload failed:', driveErr.message);
            return res.status(502).json({ message: 'Failed to save audio to storage.' });
        }

        const filePath = `https://drive.google.com/uc?export=view&id=${driveFileId}`;

        // Update the lesson_files record if file_record_id was provided,
        // otherwise create a new record.
        let fileRecord;
        if (file_record_id) {
            const updateResult = await db.query(
                `UPDATE lesson_files SET file_path = $1
                 WHERE id = $2 AND user_id = $3 RETURNING *`,
                [filePath, file_record_id, userId]
            );
            fileRecord = updateResult.rows[0];
        } else {
            const audioCount = await db.query(
                `SELECT COUNT(*) FROM lesson_files
                 WHERE lesson_id = $1 AND user_id = $2 AND type = 'audio'`,
                [lesson_id, userId]
            );
            const count = parseInt(audioCount.rows[0].count, 10) + 1;
            const insertResult = await db.query(
                `INSERT INTO lesson_files (lesson_id, user_id, type, name, file_path)
                 VALUES ($1, $2, 'audio', $3, $4) RETURNING *`,
                [lesson_id, userId, `AI Audio ${count}`, filePath]
            );
            fileRecord = insertResult.rows[0];
        }

        res.status(200).json({
            message: 'Audio generated successfully',
            file: fileRecord,
        });

    } catch (error) {
        console.error('Error in generateAudio:', error);
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
    chatWithAi,
    generateAudio,
};
