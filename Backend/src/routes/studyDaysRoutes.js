// src/routes/studyDaysRoutes.js
const express = require('express');
const router = express.Router();
const { startDay, endDay, getStats } = require('../controllers/studyDaysController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET  /api/study-days/stats — home page stats (weekly time, lesson count, streak)
router.get('/stats', getStats);

// POST /api/study-days/start — lesson opened (upsert today's row)
router.post('/start', startDay);

// PUT  /api/study-days/end — lesson closed (add duration to today)
router.put('/end', endDay);

module.exports = router;
