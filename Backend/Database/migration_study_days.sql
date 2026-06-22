-- Migration: Replace session_log with study_days
-- ============================================================
-- study_days: one row per user per day (never more)
-- Primary key (user_id, study_date) prevents duplicates
-- ============================================================

CREATE TABLE IF NOT EXISTS study_days (
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    study_date  DATE    NOT NULL,
    time_spent  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, study_date)
);

-- Index for fast streak + weekly queries
CREATE INDEX IF NOT EXISTS idx_study_days_user_date
    ON study_days (user_id, study_date DESC);

-- Drop old session_log (no longer needed)
-- Run this only after confirming study_days is working
-- DROP TABLE IF EXISTS session_log;
