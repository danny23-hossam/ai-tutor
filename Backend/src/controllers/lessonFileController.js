// src/controllers/lessonFileController.js
const db = require('../config/db');
const drive = require('../config/googleDrive');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
const https = require('https');
const http = require('http');
const { validateString } = require('../middleware/validateInput');

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// ── In-memory folder ID cache ─────────────────────────────────────────────
// Key: 'parentId::folderName'  Value: Drive folder ID
// Lives for the lifetime of the Node process — fast, no DB needed.
const folderCache = new Map();

// Helper: sanitize a string so it's safe as a Drive folder name
function safeName(str) {
    return String(str)
        .replace(/[/\\:*?"<>|']/g, '_')   // remove filename-unsafe chars + single quote (Drive query injection)
        .replace(/\s+/g, '_')             // spaces → underscores
        .slice(0, 80);                    // Drive name limit safety
}

// Helper: find an existing folder OR create it, returning its Drive ID.
// Results are cached so repeated uploads to the same lesson cost 0 extra calls.
async function getOrCreateFolder(parentId, folderName) {
    const cacheKey = `${parentId}::${folderName}`;
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

    // Search Drive for an existing folder with this name under parentId
    const listRes = await drive.files.list({
        q: [
            `name='${folderName}'`,
            `'${parentId}' in parents`,
            `mimeType='application/vnd.google-apps.folder'`,
            `trashed=false`,
        ].join(' and '),
        fields: 'files(id)',
        spaces: 'drive',
    });

    if (listRes.data.files.length > 0) {
        const id = listRes.data.files[0].id;
        folderCache.set(cacheKey, id);
        return id;
    }

    // Folder doesn't exist — create it
    const createRes = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });

    const id = createRes.data.id;
    folderCache.set(cacheKey, id);
    return id;
}

// Helper: convert a Buffer to a readable stream
function bufferToStream(buffer) {
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    return readable;
}

// Helper: extract Google Drive file ID from a stored URL
// Supports two URL formats:
//   https://drive.google.com/uc?export=view&id=FILE_ID
//   https://drive.google.com/file/d/FILE_ID/view
function extractDriveFileId(url) {
    if (!url) return null;
    try {
        // Format: ?id=FILE_ID
        const idParam = new URL(url).searchParams.get('id');
        if (idParam) return idParam;
        // Format: /file/d/FILE_ID/
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// GET /api/lesson-files/:lessonId — list all files for a lesson
const getFilesByLesson = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lessonId } = req.params;

        const result = await db.query(
            `SELECT * FROM lesson_files
             WHERE lesson_id = $1 AND user_id = $2
             ORDER BY created_at ASC`,
            [lessonId, userId]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getFilesByLesson:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/lesson-files/upload — upload a file to Google Drive
const uploadFile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: 'No file provided' });
        }
        if (!lesson_id) {
            return res.status(400).json({ message: 'lesson_id is required' });
        }

        // P2-1: verify lesson EXISTS and belongs to this user before uploading
        const [userRow, lessonRow] = await Promise.all([
            db.query('SELECT full_name FROM users WHERE id = $1', [userId]),
            db.query('SELECT title FROM lessons WHERE id = $1 AND user_id = $2', [lesson_id, userId]),
        ]);

        if (lessonRow.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        const userName   = userRow.rows[0]?.full_name  || `user_${userId}`;
        const lessonTitle = lessonRow.rows[0]?.title    || `lesson_${lesson_id}`;

        // Folder names: e.g. "user_7_Kareem_Ismail" / "lesson_3_Programming"
        const userFolderName   = safeName(`user_${userId}_${userName}`);
        const lessonFolderName = safeName(`lesson_${lesson_id}_${lessonTitle}`);

        // ── Get or create the nested folder structure ────────────────────
        //   ROOT  →  user folder  →  lesson folder  →  uploaded_files/
        const userFolderId   = await getOrCreateFolder(ROOT_FOLDER_ID, userFolderName);
        const lessonFolderId = await getOrCreateFolder(userFolderId, lessonFolderName);
        const uploadedFolderId = await getOrCreateFolder(lessonFolderId, 'uploaded_files');

        // ── Upload the file into the lesson folder ───────────────────────
        const { originalname, mimetype, buffer } = req.file;
        const driveFileName = `${Date.now()}_${safeName(originalname)}`;

        const driveResponse = await drive.files.create({
            requestBody: {
                name: driveFileName,
                parents: [uploadedFolderId],  // ← uploads go into uploaded_files/ subfolder
                mimeType: mimetype,
            },
            media: {
                mimeType: mimetype,
                body: bufferToStream(buffer),
            },
            fields: 'id',
        });

        const fileId = driveResponse.data.id;

        // LOW-NEW-3: Do NOT grant 'reader' permission to 'anyone'.
        // Files are served exclusively through the authenticated /stream and /download
        // proxy endpoints (which enforce ownership). A raw Drive URL cannot bypass auth.
        // Note: existing uploaded files that were already made public are not affected —
        // only new uploads from this point forward will be private.

        const file_path = `https://drive.google.com/uc?export=view&id=${fileId}`;

        const result = await db.query(
            `INSERT INTO lesson_files (lesson_id, user_id, type, name, file_path)
             VALUES ($1, $2, 'upload', $3, $4) RETURNING *`,
            [lesson_id, userId, originalname, file_path]
        );

        res.status(201).json(result.rows[0]);

        // ── Option C: Auto-generate summary in the background ────────
        // Fire-and-forget — don't block the upload response
        const aiService = require('../services/aiService');
        (async () => {
            try {
                const aiReady = await aiService.isAvailable();
                if (!aiReady) {
                    console.log('[auto-summary] AI service not available, skipping.');
                    return;
                }

                // Check if summary already exists for this lesson
                const existingSummary = await db.query(
                    `SELECT id FROM ai_generations
                     WHERE user_id = $1 AND lesson_id = $2 AND type = 'summary'`,
                    [userId, lesson_id]
                );

                // Call AI to generate/regenerate summary
                const summary = await aiService.callSummarize('', String(userId), String(lesson_id));
                if (!summary) {
                    console.log('[auto-summary] AI returned no summary.');
                    return;
                }

                const summaryText = typeof summary === 'string' ? summary : JSON.stringify(summary);

                if (existingSummary.rows.length > 0) {
                    await db.query(
                        `UPDATE ai_generations SET content = $1 WHERE id = $2`,
                        [summaryText, existingSummary.rows[0].id]
                    );
                    console.log(`[auto-summary] Updated summary for lesson ${lesson_id}`);
                } else {
                    await db.query(
                        `INSERT INTO ai_generations (user_id, lesson_id, type, content)
                         VALUES ($1, $2, 'summary', $3)`,
                        [userId, lesson_id, summaryText]
                    );
                    console.log(`[auto-summary] Created summary for lesson ${lesson_id}`);
                }
            } catch (err) {
                console.error('[auto-summary] Background generation failed:', err.message);
            }
        })();

    } catch (error) {
        console.error('Error in uploadFile:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/lesson-files — create a name-only record (AI-generated video/audio)
const createRecord = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lesson_id, type, name, file_path, source_file_ids, source_files } = req.body;

        if (!lesson_id || !type || !name) {
            return res.status(400).json({ message: 'lesson_id, type, and name are required' });
        }

        // P3-2: allowlist valid types
        const VALID_RECORD_TYPES = ['video', 'audio'];
        if (!VALID_RECORD_TYPES.includes(type)) {
            return res.status(400).json({ message: `type must be one of: ${VALID_RECORD_TYPES.join(', ')}` });
        }

        // P3-1: enforce name length
        const nameErr = validateString(name, 'File name', { min: 1, max: 200 });
        if (nameErr) return res.status(400).json({ message: nameErr });

        // P2-1: verify lesson exists AND belongs to this user
        const lessonOwnership = await db.query(
            'SELECT id FROM lessons WHERE id = $1 AND user_id = $2',
            [lesson_id, userId]
        );
        if (lessonOwnership.rows.length === 0) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        // ── Resolve the target Drive subfolder for this record ───────────
        // This gives the AI team the folder ID to upload the generated file into.
        let targetDriveFolderId = null;
        try {
            const [userRow, lessonRow] = await Promise.all([
                db.query('SELECT full_name FROM users WHERE id = $1', [userId]),
                db.query('SELECT title FROM lessons WHERE id = $1', [lesson_id]),
            ]);
            const userName     = userRow.rows[0]?.full_name || `user_${userId}`;
            const lessonTitle  = lessonRow.rows[0]?.title   || `lesson_${lesson_id}`;
            const userFolderName   = safeName(`user_${userId}_${userName}`);
            const lessonFolderName = safeName(`lesson_${lesson_id}_${lessonTitle}`);

            const userFolderId   = await getOrCreateFolder(ROOT_FOLDER_ID, userFolderName);
            const lessonFolderId = await getOrCreateFolder(userFolderId, lessonFolderName);

            // videos/ or audios/ subfolder
            const subfolderName  = type === 'video' ? 'videos' : 'audios';
            targetDriveFolderId  = await getOrCreateFolder(lessonFolderId, subfolderName);
        } catch (folderErr) {
            // Non-fatal: placeholder record is still useful without folder
            console.warn('Could not resolve Drive folder for record:', folderErr.message);
        }

        const result = await db.query(
            `INSERT INTO lesson_files (lesson_id, user_id, type, name, file_path)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [lesson_id, userId, type, name, file_path || null]
        );

        // If we create a pending video placeholder (no file_path yet), ensure
        // old/stale watched counts cannot make it appear instantly completed.
        if (type === 'video' && !file_path) {
            await db.query(
                `UPDATE user_lesson
                 SET videos_watched_count = LEAST(
                     videos_watched_count,
                     (
                         SELECT COUNT(*)
                         FROM lesson_files
                         WHERE lesson_id = $1
                           AND user_id = $2
                           AND type = 'video'
                           AND NULLIF(BTRIM(file_path), '') IS NOT NULL
                     )
                 )
                 WHERE lesson_id = $1 AND user_id = $2`,
                [lesson_id, userId]
            );
        }

        // Return the target Drive folder ID so the AI team knows where to upload
        res.status(201).json({
            ...result.rows[0],
            target_drive_folder_id: targetDriveFolderId,
            source_file_ids: source_file_ids || [],
            source_files: source_files || [],
        });
    } catch (error) {
        console.error('Error in createRecord:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// PUT /api/lesson-files/:id — rename a file record
const renameFile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { name } = req.body;

        // MED-NEW-2: enforce length limit on file name
        const nameErr = validateString(name, 'File name', { min: 1, max: 200 });
        if (nameErr) return res.status(400).json({ message: nameErr });

        const result = await db.query(
            `UPDATE lesson_files SET name = $1
             WHERE id = $2 AND user_id = $3 RETURNING *`,
            [name.trim(), id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error in renameFile:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// DELETE /api/lesson-files/:id — delete record and remove file from Google Drive
const deleteFile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Fetch the record first to get the file_path
        const existing = await db.query(
            'SELECT * FROM lesson_files WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const record = existing.rows[0];

        // Delete from DB first
        await db.query('DELETE FROM lesson_files WHERE id = $1', [id]);

        // If a video is deleted, clamp watched-count to remaining ready videos
        // to prevent stale completion from carrying over to newly generated videos.
        if (record.type === 'video') {
            await db.query(
                `UPDATE user_lesson
                 SET videos_watched_count = LEAST(
                     videos_watched_count,
                     (
                         SELECT COUNT(*)
                         FROM lesson_files
                         WHERE lesson_id = $1
                           AND user_id = $2
                           AND type = 'video'
                           AND NULLIF(BTRIM(file_path), '') IS NOT NULL
                     )
                 )
                 WHERE lesson_id = $1 AND user_id = $2`,
                [record.lesson_id, userId]
            );
        }

        // Delete from Google Drive if URL present
        if (record.file_path && record.file_path.includes('drive.google.com')) {
            const fileId = extractDriveFileId(record.file_path);
            if (fileId) {
                try {
                    await drive.files.delete({ fileId });
                } catch (driveErr) {
                    console.error('Google Drive delete error (non-fatal):', driveErr.message);
                }
            }
        }

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error in deleteFile:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// GET /api/lesson-files/download/:id — proxy download with correct filename
const downloadFile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        if (req.user.scope === 'stream' && req.user.fileId !== parseInt(id, 10)) {
            return res.status(403).json({ message: 'Stream token is not valid for this file' });
        }

        const result = await db.query(
            'SELECT * FROM lesson_files WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const record = result.rows[0];
        if (!record.file_path) {
            return res.status(404).json({ message: 'No file available' });
        }

        // P2-2: SSRF guard — only fetch from Google Drive URLs.
        // If file_path is not a Drive URL (e.g. an arbitrary URL written via createRecord),
        // reject immediately instead of making a server-side request to it.
        const driveFileId = extractDriveFileId(record.file_path);
        if (!driveFileId) {
            return res.status(404).json({ message: 'File is not available for download' });
        }

        const downloadUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}`;

        const filename = record.name || 'download';
        const safeFilename = encodeURIComponent(filename);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${safeFilename}`);
        res.setHeader('Content-Type', 'application/octet-stream');

        // Stream the file to the client
        const protocol = downloadUrl.startsWith('https') ? https : http;
        protocol.get(downloadUrl, (fileRes) => {
            // Follow redirects (Drive download redirects once)
            if (fileRes.statusCode === 302 || fileRes.statusCode === 301) {
                const redirectUrl = fileRes.headers.location;
                https.get(redirectUrl, (redirectRes) => {
                    redirectRes.pipe(res);
                }).on('error', (err) => {
                    console.error('Redirect download error:', err.message);
                    if (!res.headersSent) res.status(500).json({ message: 'Failed to download file' });
                });
            } else {
                fileRes.pipe(res);
            }
        }).on('error', (err) => {
            console.error('Proxy download error:', err.message);
            if (!res.headersSent) res.status(500).json({ message: 'Failed to download file' });
        });

    } catch (error) {
        console.error('Error in downloadFile:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// POST /api/lesson-files/stream-token/:id — exchange full JWT for a 2-minute scoped stream token
// HIGH-1 fix: native <video>/<audio> elements cannot send Authorization headers,
// so we can't pass the full long-lived JWT in the URL (it leaks into logs/history).
// Instead the frontend calls this endpoint (with the full JWT in the Authorization header),
// receives a short-lived, file-scoped token, and embeds THAT in the media src URL.
const getStreamToken = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Verify the file exists and belongs to this user
        const result = await db.query(
            'SELECT id FROM lesson_files WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Issue a minimal, short-lived token scoped to this one file
        const streamToken = jwt.sign(
            { userId, fileId: parseInt(id, 10), scope: 'stream' },
            process.env.JWT_SECRET,
            { expiresIn: '2m' }
        );

        res.status(200).json({ token: streamToken });
    } catch (error) {
        console.error('Error in getStreamToken:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Internal helper: verify a stream token from a query param (?streamToken=...)
// Used by streamFile and downloadFile so the full JWT is never needed in a URL.
function verifyStreamToken(req, res) {
    const raw = req.query.streamToken;
    if (!raw) {
        res.status(401).json({ message: 'Stream token required' });
        return null;
    }
    try {
        const decoded = jwt.verify(raw, process.env.JWT_SECRET);
        if (decoded.scope !== 'stream') throw new Error('wrong scope');
        return decoded; // { userId, fileId, scope }
    } catch (err) {
        res.status(401).json({ message: 'Stream token invalid or expired. Please refresh the page.' });
        return null;
    }
}

// ── streamFile — inline stream for <video> / <audio> playback ───────────────
// Serves the file without Content-Disposition so the browser plays it inline.
// Supports Range requests (required for video seeking / audio scrubbing).
// Uses the authenticated Drive API client (OAuth2) — NOT a raw https.get —
// so service-account-owned files are not rejected with 403.
const streamFile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Confirm the token's fileId matches the URL param (prevents token reuse on other files)
        if (req.user.scope === 'stream' && req.user.fileId !== parseInt(id, 10)) {
            return res.status(403).json({ message: 'Stream token is not valid for this file' });
        }

        const result = await db.query(
            'SELECT * FROM lesson_files WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'File not found' });

        const record = result.rows[0];
        if (!record.file_path) return res.status(204).end(); // no file yet

        // Extract Drive file ID from stored URL
        let driveFileId;
        try {
            driveFileId = new URL(record.file_path).searchParams.get('id');
        } catch { /* not a URL */ }
        if (!driveFileId) {
            const m = record.file_path.match(/\/d\/([a-zA-Z0-9_-]+)/);
            driveFileId = m ? m[1] : null;
        }
        if (!driveFileId) return res.status(400).json({ message: 'Cannot determine Drive file ID' });

        // Content-Type by record type
        const contentTypes = { video: 'video/mp4', audio: 'audio/mpeg', upload: 'application/octet-stream' };
        const contentType = contentTypes[record.type] || 'application/octet-stream';

        // Helper: race a Drive API promise against an 8-second timeout.
        // On local dev the Drive API may hang indefinitely (ETIMEDOUT).
        // Failing fast with 503 lets the browser try the next <source> immediately.
        const withTimeout = (promise) =>
            Promise.race([
                promise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('DRIVE_TIMEOUT')), 8000)
                ),
            ]);

        // ── Use authenticated Drive API to get file metadata (size) ──────────
        let fileSize = null;
        try {
            const meta = await withTimeout(
                drive.files.get({ fileId: driveFileId, fields: 'size' })
            );
            fileSize = parseInt(meta.data.size, 10);
        } catch (_) {
            fileSize = null; // size unknown — partial content won't be offered
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');

        // ── Range request (seeking) ───────────────────────────────────────────
        const rangeHeader = req.headers.range;
        if (rangeHeader && fileSize) {
            const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', chunkSize);
            res.status(206);

            const driveRes = await withTimeout(
                drive.files.get(
                    { fileId: driveFileId, alt: 'media' },
                    { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } }
                )
            );
            driveRes.data.pipe(res);
            return;
        }

        // ── Full file stream ──────────────────────────────────────────────────
        if (fileSize) res.setHeader('Content-Length', fileSize);

        const driveRes = await withTimeout(
            drive.files.get(
                { fileId: driveFileId, alt: 'media' },
                { responseType: 'stream' }
            )
        );
        driveRes.data.pipe(res);

    } catch (error) {
        console.error('Error in streamFile:', error.message);
        if (!res.headersSent) {
            const status = error.message === 'DRIVE_TIMEOUT' ? 503 : 500;
            res.status(status).json({
                message: error.message === 'DRIVE_TIMEOUT'
                    ? 'Stream temporarily unavailable'
                    : 'Internal Server Error'
            });
        }
    }
};

// GET /api/lesson-files/all — all files for the user across all lessons
const getAllFiles = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await db.query(
            `SELECT id, lesson_id, type, name, file_path, created_at
             FROM lesson_files
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in getAllFiles:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


module.exports = {
    getFilesByLesson,
    getAllFiles,
    uploadFile,
    createRecord,
    renameFile,
    deleteFile,
    downloadFile,
    streamFile,
    getStreamToken,
};


