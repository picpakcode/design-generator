-- Comment threads: replies, resolve, emoji reactions, author type
ALTER TABLE project_comments
  ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES project_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS reactions   JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS author_type TEXT  DEFAULT 'reviewer';

CREATE INDEX IF NOT EXISTS project_comments_parent
  ON project_comments(parent_id) WHERE parent_id IS NOT NULL;
