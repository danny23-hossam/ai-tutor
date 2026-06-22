-- Migration: Add email verification columns to users table
-- Run this once in your PostgreSQL database (Supabase SQL editor, psql, etc.)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_verified         BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verify_token        TEXT,
    ADD COLUMN IF NOT EXISTS verify_token_expires TIMESTAMPTZ;

-- Index for fast token lookups (called on every verification link click)
CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users (verify_token)
    WHERE verify_token IS NOT NULL;

-- Optional: mark all EXISTING users as already verified so they can still log in
-- (Remove this line if you want existing users to re-verify)
UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE;
