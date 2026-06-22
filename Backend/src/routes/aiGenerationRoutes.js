// src/routes/aiGenerationRoutes.js
const express = require('express');
const router = express.Router();
const {
    getAiGenerations,
    getAiGenerationsByLesson,
    getAiGenerationById,
    createAiGeneration,
    updateAiGeneration,
    deleteAiGeneration,
    triggerAiGeneration,
    getAiGenerationStatus,
} = require('../controllers/aiGenerationController');
const { protect } = require('../middleware/authMiddleware');

// All AI generation routes require authentication
router.use(protect);

// POST /api/ai-generations/trigger   - trigger AI generation (calls FastAPI)
router.post('/trigger', triggerAiGeneration);

// GET /api/ai-generations/status/:lessonId - check what's generated for a lesson
router.get('/status/:lessonId', getAiGenerationStatus);

// GET /api/ai-generations            - all generations for logged-in user (supports ?type=summary|quiz|exam)
router.get('/', getAiGenerations);

// GET /api/ai-generations/lesson/:lessonId  - all generations for a specific lesson (supports ?type=...)
router.get('/lesson/:lessonId', getAiGenerationsByLesson);

// GET /api/ai-generations/:id        - single generation by ID
router.get('/:id', getAiGenerationById);

// POST /api/ai-generations           - create a new AI generation record
router.post('/', createAiGeneration);

// PUT /api/ai-generations/:id        - update content/type
router.put('/:id', updateAiGeneration);

// DELETE /api/ai-generations/:id     - delete a generation record
router.delete('/:id', deleteAiGeneration);

module.exports = router;
