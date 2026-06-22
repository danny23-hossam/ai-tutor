-- ============================================================
-- AI Tutor Database Schema
-- ============================================================

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lessons Table
CREATE TABLE lessons (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User_Lesson Tracking Table
CREATE TABLE user_lesson (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    time_spent INTEGER DEFAULT 0,
    videos_watched_count INTEGER DEFAULT 0,
    practice_completed BOOLEAN DEFAULT FALSE,
    last_entered TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    quiz_score NUMERIC(5, 2),
    exam_score NUMERIC(5, 2)
);

-- AI Generations Table
CREATE TABLE ai_generations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    type VARCHAR(50) CHECK (type IN ('summary', 'quiz', 'exam')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lesson Files Table
-- 'upload' = user-uploaded file (runs through OCR → AI pipeline)
-- 'video'  = AI-generated video file (produced by AI model)
-- 'audio'  = AI-generated audio file (produced by AI model)
-- Actual files are saved on disk; file_path stores the relative path.
CREATE TABLE lesson_files (
    id        SERIAL PRIMARY KEY,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    user_id   INTEGER REFERENCES users(id)   ON DELETE CASCADE,
    type      VARCHAR(20) CHECK (type IN ('upload', 'video', 'audio')) NOT NULL,
    name      TEXT NOT NULL,
    file_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Session Log Table
-- Records every individual study session for accurate stats
CREATE TABLE session_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    lesson_id   INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    started_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    duration    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_log_user_started
    ON session_log (user_id, started_at DESC);

