-- Per-block comments (anonymous reviewers enter their name)
create table if not exists project_comments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  block_id     text not null,
  share_token  text not null,
  author_name  text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists project_comments_project_block on project_comments (project_id, block_id);

-- Per-block approval votes (approve / request changes)
create table if not exists block_approvals (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  block_id     text not null,
  share_token  text not null,
  author_name  text not null,
  status       text not null check (status in ('approved', 'changes_requested')),
  created_at   timestamptz not null default now()
);
create index if not exists block_approvals_project_block on block_approvals (project_id, block_id);

-- Enable RLS (admin API key bypasses it, but enable for safety)
alter table project_comments enable row level security;
alter table block_approvals enable row level security;
