-- Run this in Supabase → SQL Editor
-- Creates the canto_tokens table for storing user OAuth tokens

CREATE TABLE IF NOT EXISTS canto_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS canto_tokens_user_id_idx ON canto_tokens(user_id);
ALTER TABLE canto_tokens ENABLE ROW LEVEL SECURITY;
