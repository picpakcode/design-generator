-- Session lock: one editor at a time per project.
-- locked_by          — user_id of whoever holds the edit lock (null = nobody)
-- locked_at          — when the lock was acquired
-- lock_expires_at    — stale after this; another user can steal it
-- locked_by_email    — stored for display (can't query auth.users from the browser)

alter table projects
  add column if not exists locked_by        text,
  add column if not exists locked_at        timestamptz,
  add column if not exists lock_expires_at  timestamptz,
  add column if not exists locked_by_email  text;

create index if not exists projects_locked_by_idx
  on projects (locked_by)
  where locked_by is not null;
