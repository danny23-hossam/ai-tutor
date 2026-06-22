// src/routes/lessonFileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const {
    getFilesByLesson,
    getAllFiles,
    uploadFile,
    createRecord,
    renameFile,
    deleteFile,
    downloadFile,
    streamFile,
    getStreamToken,
} = require('../controllers/lessonFileController');

// --- Multer in-memory storage (buffer passed to Google Drive uploader) ---
const storage = multer.memoryStorage();

// HIGH-2: allowlist only safe MIME types — reject executables, scripts, HTML, etc.
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type '${file.mimetype}' is not allowed. Accepted: PDF, images, video, audio, Word, PowerPoint, plain text.`));
        }
    },
});

// All routes require authentication
router.use(protect);

// POST /api/lesson-files/stream-token/:id  — exchange JWT for a 2-min scoped stream token (HIGH-1)
router.post('/stream-token/:id', getStreamToken);

// GET  /api/lesson-files/download/:id  — proxy download with correct filename
router.get('/download/:id', downloadFile);

// GET  /api/lesson-files/stream/:id   — inline stream for <video>/<audio> playback
router.get('/stream/:id', streamFile);

// GET  /api/lesson-files/all       — all files for the user (all lessons)
router.get('/all', getAllFiles);

// GET  /api/lesson-files/:lessonId  — list files for a lesson
router.get('/:lessonId', getFilesByLesson);

// POST /api/lesson-files/upload     — upload a file to Google Drive
router.post('/upload', upload.single('file'), uploadFile);

// POST /api/lesson-files            — create a name-only record (AI video/audio)
router.post('/', createRecord);

// PUT  /api/lesson-files/:id        — rename
router.put('/:id', renameFile);

// DELETE /api/lesson-files/:id      — delete record + Google Drive file
router.delete('/:id', deleteFile);

module.exports = router;
