// src/services/aiService.js
// Bridge between Node.js backend and the AI team's FastAPI server.
// All calls are fault-tolerant — if FastAPI is down, they return null
// instead of crashing the caller.

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:8000';

// Longer timeout for AI models (they can take 30-60s for long texts)
const ai = axios.create({
    baseURL: AI_API_URL,
    timeout: 120_000, // 2 minutes
});

/**
 * Health check — is the FastAPI server reachable?
 */
async function isAvailable() {
    try {
        await ai.get('/', { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * OCR — Extract text from an uploaded file (PDF, image, etc.)
 * @param {string} filePath - Absolute path to the file on disk (or temp file)
 * @param {string} userId
 * @param {string} lessonId
 * @param {string} [quality='fast'] - 'fast' or 'quality'
 * @returns {Promise<string|null>} Extracted text or null on failure
 */
async function callOCR(filePath, userId, lessonId, quality = 'fast') {
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));

        const res = await ai.post('/ocr', form, {
            params: { quality, userID: userId, lid: lessonId },
            headers: form.getHeaders(),
        });
        return res.data;
    } catch (err) {
        console.error('[aiService] OCR failed:', err.message);
        return null;
    }
}

/**
 * Summarize — Generate a lesson summary from extracted text.
 * @param {string} text - The source text (from OCR or concatenated uploads)
 * @param {string} userId
 * @param {string} lessonId
 * @returns {Promise<string|null>} Summary HTML/text or null
 */
async function callSummarize(text, userId, lessonId) {
    try {
        const res = await ai.post('/summarize', { text }, {
            params: { userID: userId, lid: lessonId },
        });
        return res.data?.summary || res.data;
    } catch (err) {
        console.error('[aiService] Summarize failed:', err.message);
        return null;
    }
}

/**
 * Flip Cards — Generate quiz flashcards from text.
 * @returns {Promise<Array|null>} Array of {question, answer, why_correct, common_mistake}
 */
async function callFlipCards(text, userId, lessonId) {
    try {
        const res = await ai.post('/flip-cards', { text }, {
            params: { userID: userId, lid: lessonId },
        });
        // FastAPI returns the array directly
        return Array.isArray(res.data) ? res.data : null;
    } catch (err) {
        console.error('[aiService] FlipCards failed:', err.message);
        return null;
    }
}

/**
 * Questions — Generate exam MCQ questions from text.
 * @returns {Promise<Array|null>} Array of {question, a, b, c, d, solution}
 */
async function callQuestions(text, userId, lessonId) {
    try {
        const res = await ai.post('/questions', { text }, {
            params: { userID: userId, lid: lessonId },
        });
        return Array.isArray(res.data) ? res.data : null;
    } catch (err) {
        console.error('[aiService] Questions failed:', err.message);
        return null;
    }
}

module.exports = {
    isAvailable,
    callOCR,
    callSummarize,
    callFlipCards,
    callQuestions,
    AI_API_URL,
};
