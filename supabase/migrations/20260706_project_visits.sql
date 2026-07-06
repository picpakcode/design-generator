-- Track which projects each user has opened as a collaborator.
-- Used to populate the "Shared with me" section on the dashboard.

create table if not exists project_visits (
  project_id      text        not null references projects(id) on delete cascade,
  user_id         text        not null,
  last_visited_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table project_visits enable row level security;

-- Users can only see and manage their own visit records
create policy "users_own_visits"
  on project_visits
  for all
  to authenticated
  using  (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
