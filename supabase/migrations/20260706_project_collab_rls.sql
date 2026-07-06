-- Allow any authenticated user to read and update any project.
-- Required for the session-lock collaboration feature: user 2 needs to load
-- the project (SELECT) and acquire/release the lock (UPDATE).
--
-- PostgreSQL PERMISSIVE policies are OR'd together, so these new policies
-- effectively override the existing owner-only SELECT/UPDATE restrictions
-- without needing to drop or rename anything.
--
-- INSERT and DELETE remain owner-only (unchanged).

create policy if not exists "collaborators_select_projects"
  on projects for select
  to authenticated
  using (true);

create policy if not exists "collaborators_update_projects"
  on projects for update
  to authenticated
  using (true)
  with check (true);
