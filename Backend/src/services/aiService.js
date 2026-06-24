// src/services/aiService.js
// Bridge between Node.js backend and the AI team's FastAPI pipeline server.
// All calls target the pipeline service (port 8005) which orchestrates the
// internal microservices (OCR, text gen, TTS, vector DB, RAG).
//
// All calls are fault-tolerant — if the pipeline is down they return null
// instead of crashing the caller.

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// The pipeline service is the single entry point for all AI operations.
const AI_API_URL = process.env.AI_API_URL || 'http://localhost:8005';

// Longer timeout for AI models (OCR + generation can take 1-5 minutes)
const ai = axios.create({
    baseURL: AI_API_URL,
    timeout: 300_000, // 5 minutes — OCR on large PDFs can be slow
    headers: {
        // Bypass ngrok's free-tier browser interstitial page.
        // Without this, ngrok returns HTML instead of the API response.
        'ngrok-skip-browser-warning': 'true',
    },
});

/**
 * Health check — is the pipeline service reachable and are all downstream
 * services (text, TTS, OCR, RAG, vector DB) healthy?
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    try {
        const res = await ai.get('/health', { timeout: 5000 });
        return res.status === 200;
    } catch {
        return false;
    }
}

/**
 * Upload a document to the pipeline for OCR, text extraction, chunking,
 * and storage in the vector DB. This MUST be called after every file upload
 * so the pipeline can answer questions about it later.
 *
 * @param {string} userId       - Internal user ID (will be stringified)
 * @param {string} documentId   - lesson_files.id for this file
 * @param {string} lessonId     - lessons.id this file belongs to
 * @param {Buffer} fileBuffer   - Raw file bytes
 * @param {string} filename     - Original filename (e.g. "lecture.pdf")
 * @param {string} mimetype     - MIME type (e.g. "application/pdf")
 * @returns {Promise<object|null>} Pipeline response or null on failure
 */
async function callPipelineUpload(userId, documentId, lessonId, fileBuffer, filename, mimetype) {
    try {
        const form = new FormData();
        form.append('user_id', String(userId));
        form.append('document_id', String(documentId));
        form.append('lesson_id', String(lessonId));
        form.append('file', fileBuffer, {
            filename: filename,
            contentType: mimetype,
        });

        const res = await ai.post('/pipeline/documents/upload', form, {
            headers: form.getHeaders(),
            timeout: 300_000, // 5 min — large PDFs + OCR can be slow
        });
        console.log(`[aiService] Pipeline upload OK: doc=${documentId} lesson=${lessonId} source=${res.data?.source}`);
        return res.data;
    } catch (err) {
        console.error('[aiService] Pipeline document upload failed:', err.message);
        return null;
    }
}

/**
 * Generate (or retrieve cached) summary for a document.
 *
 * @param {string} userId
 * @param {string} documentId  - lesson_files.id
 * @param {string} lessonId
 * @returns {Promise<string|null>} Summary text or null
 */
async function callPipelineSummary(userId, documentId, lessonId) {
    try {
        const res = await ai.post('/pipeline/summary', {
            user_id: String(userId),
            document_id: String(documentId),
            lesson_id: String(lessonId),
        });
        // Response: { source, summary: { summary_text, ... } }
        return res.data?.summary?.summary_text || null;
    } catch (err) {
        console.error('[aiService] Pipeline summary failed:', err.message);
        return null;
    }
}

/**
 * Generate (or retrieve cached) flashcard quiz for a document.
 * Transforms the pipeline format to match what the frontend expects:
 * { question, answer, why_correct, common_mistake }
 *
 * @param {string} userId
 * @param {string} documentId
 * @param {string} lessonId
 * @param {string} [qty='standard']  low | standard | high
 * @param {string} [diff='standard'] easy | standard | hard
 * @returns {Promise<Array|null>}
 */
async function callPipelineFlashcards(userId, documentId, lessonId, qty = 'standard', diff = 'standard') {
    try {
        const res = await ai.post('/pipeline/flashcards', {
            user_id: String(userId),
            document_id: String(documentId),
            lesson_id: String(lessonId),
            qty,
            diff,
        });

        let flashcards = res.data?.flashcards;

        // Cache hit: pipeline wraps flashcards as { "flashcards": [...] } inside the response field
        // e.g. res.data = { source: "cache", flashcards: { "flashcards": [...] } }
        if (flashcards && !Array.isArray(flashcards) && Array.isArray(flashcards.flashcards)) {
            flashcards = flashcards.flashcards;
        }

        if (!Array.isArray(flashcards) || flashcards.length === 0) return null;

        // Transform pipeline format → frontend format
        // Pipeline: { question, answer }
        // Frontend (QuizFlashcards.jsx): { question, answer, why_correct, common_mistake }
        return flashcards.map((fc) => ({
            question: fc.question || '',
            answer: fc.answer || '',
            why_correct: fc.why_correct || fc.explanation || '',
            common_mistake: fc.common_mistake || '',
        }));
    } catch (err) {
        console.error('[aiService] Pipeline flashcards failed:', err.message);
        return null;
    }
}

/**
 * Generate (or retrieve cached) MCQ exam questions for a document.
 * Transforms the pipeline format to match what the frontend expects:
 * { question, a, b, c, d, solution }
 *
 * @param {string} userId
 * @param {string} documentId
 * @param {string} lessonId
 * @param {string} [qty='standard']  low | standard | high
 * @param {string} [diff='standard'] easy | standard | hard
 * @returns {Promise<Array|null>}
 */
async function callPipelineQuestions(userId, documentId, lessonId, qty = 'standard', diff = 'standard') {
    try {
        const res = await ai.post('/pipeline/questions', {
            user_id: String(userId),
            document_id: String(documentId),
            lesson_id: String(lessonId),
            qty,
            diff,
        });

        let questions = res.data?.questions;

        // Cache hit: pipeline wraps questions as { "mcqs": [...] } inside the response field
        // e.g. res.data = { source: "cache", questions: { "mcqs": [...] } }
        if (questions && !Array.isArray(questions) && Array.isArray(questions.mcqs)) {
            questions = questions.mcqs;
        }

        if (!Array.isArray(questions) || questions.length === 0) return null;

        // Transform pipeline format → frontend format
        // Pipeline: { question, options: { A, B, C, D }, answer: "A", explanation }
        // Frontend (ExamStart.jsx): { question, a, b, c, d, solution }
        //   where solution is lowercase letter that matches the correct option.
        return questions.map((q) => ({
            question: q.question || '',
            a: q.options?.A || '',
            b: q.options?.B || '',
            c: q.options?.C || '',
            d: q.options?.D || '',
            solution: (q.answer || 'A').toLowerCase(), // frontend checks lowercase
            explanation: q.explanation || '',
        }));
    } catch (err) {
        console.error('[aiService] Pipeline questions failed:', err.message);
        return null;
    }
}

/**
 * Ask a document-grounded question using RAG + chat memory.
 * Used by the AI Tutor chat panel.
 *
 * @param {string} userId
 * @param {string} documentId
 * @param {string} lessonId
 * @param {string} question
 * @returns {Promise<string|null>} Answer text or null
 */
async function callPipelineAsk(userId, documentId, lessonId, question) {
    try {
        const res = await ai.post('/pipeline/ask', {
            user_id: String(userId),
            document_id: String(documentId),
            lesson_id: String(lessonId),
            question,
        });
        return res.data?.answer || null;
    } catch (err) {
        console.error('[aiService] Pipeline ask failed:', err.message);
        return null;
    }
}

/**
 * Generate (or retrieve cached) transcript for a document.
 *
 * @param {string} userId
 * @param {string} documentId
 * @param {string} lessonId
 * @param {string} [language='ar']  en | ar
 * @returns {Promise<string|null>} Transcript text or null
 */
async function callPipelineTranscript(userId, documentId, lessonId, language = 'ar') {
    try {
        const res = await ai.post('/pipeline/transcript', {
            user_id: String(userId),
            document_id: String(documentId),
            lesson_id: String(lessonId),
            language,
        });
        return res.data?.transcript?.transcript_text || null;
    } catch (err) {
        console.error('[aiService] Pipeline transcript failed:', err.message);
        return null;
    }
}

/**
 * Prepare (or retrieve cached) TTS audio for a document.
 * The pipeline generates the audio, stores it on S3, and returns a
 * pre-signed URL the browser can stream directly.
 *
 * @param {string} userId
 * @param {string} documentId
 * @param {string} lessonId
 * @param {string} [language='ar']  en | ar
 * @returns {Promise<object|null>} { status, source, audio_url, expires_in, content_type, size_bytes, s3_key } or null
 */
async function callPipelineAudioPrepare(userId, documentId, lessonId, language = 'ar') {
    try {
        const res = await ai.post('/pipeline/audio/prepare', {
            user_id: String(userId),
            document_id: String(documentId),
            lesson_id: String(lessonId),
            language,
        }, {
            timeout: 600_000, // 10 min — TTS on long transcripts is slow
        });

        if (!res.data?.audio_url) {
            console.error('[aiService] Pipeline audio/prepare returned no audio_url:', res.data);
            return null;
        }

        return res.data;
    } catch (err) {
        console.error('[aiService] Pipeline audio/prepare failed:', err.message);
        return null;
    }
}

/**
 * @deprecated Use callPipelineAudioPrepare instead — old method downloaded raw WAV bytes.
 */
async function callPipelineAudio(userId, documentId, lessonId, language = 'ar') {
    console.warn('[aiService] callPipelineAudio is deprecated — use callPipelineAudioPrepare');
    return null;
}

// ── Legacy methods kept for backwards compatibility ────────────────────────
// These are no longer called by the main flow but are kept in case any
// old code still references them. They all delegate to the pipeline.

/**
 * @deprecated Use callPipelineSummary instead
 */
async function callSummarize(text, userId, lessonId) {
    console.warn('[aiService] callSummarize is deprecated — use callPipelineSummary');
    return null; // Cannot call pipeline without a documentId
}

/**
 * @deprecated Use callPipelineFlashcards instead
 */
async function callFlipCards(text, userId, lessonId) {
    console.warn('[aiService] callFlipCards is deprecated — use callPipelineFlashcards');
    return null;
}

/**
 * @deprecated Use callPipelineQuestions instead
 */
async function callQuestions(text, userId, lessonId) {
    console.warn('[aiService] callQuestions is deprecated — use callPipelineQuestions');
    return null;
}

/**
 * @deprecated Use callPipelineUpload instead
 */
async function callOCR(filePath, userId, lessonId, quality = 'fast') {
    console.warn('[aiService] callOCR is deprecated — use callPipelineUpload');
    return null;
}

module.exports = {
    isAvailable,
    // New pipeline methods
    callPipelineUpload,
    callPipelineSummary,
    callPipelineFlashcards,
    callPipelineQuestions,
    callPipelineAsk,
    callPipelineTranscript,
    callPipelineAudioPrepare,
    callPipelineAudio,
    // Legacy (deprecated)
    callSummarize,
    callFlipCards,
    callQuestions,
    callOCR,
    AI_API_URL,
};
