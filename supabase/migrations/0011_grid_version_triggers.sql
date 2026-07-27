-- Make grid_version a true optimistic-lock token.
--
-- apply_change_request_tx compares grid_version to the value the organizer's
-- page validated against, but only that function and replace_draft_assignments
-- ever bumped it. Manual placements, removals, block and room edits changed the
-- grid silently, so an apply validated against a stale grid could still land —
-- e.g. dragging a session into a cell while an apply for that same cell is in
-- flight ends with both in one room-slot. Every grid mutation now bumps the
-- version, so those applies fail with STALE_GRID and revalidate.

create or replace function public.bump_grid_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- Bump both sides: a row moved between events invalidates each one's grid.
  -- OLD/NEW are only assigned for the operations that have them.
  if tg_op in ('INSERT', 'UPDATE') then
    update events set grid_version = grid_version + 1 where id = new.event_id;
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.event_id is distinct from new.event_id) then
    update events set grid_version = grid_version + 1 where id = old.event_id;
  end if;
  return null;
end;
$$;

drop trigger if exists agenda_assignments_bump_version on public.agenda_assignments;
create trigger agenda_assignments_bump_version
  after insert or update or delete on public.agenda_assignments
  for each row execute function public.bump_grid_version();

drop trigger if exists agenda_blocks_bump_version on public.agenda_blocks;
create trigger agenda_blocks_bump_version
  after insert or update or delete on public.agenda_blocks
  for each row execute function public.bump_grid_version();

drop trigger if exists tracks_bump_version on public.tracks;
create trigger tracks_bump_version
  after insert or update or delete on public.tracks
  for each row execute function public.bump_grid_version();

-- Daily hours live on events itself, so bump in place rather than recursing.
create or replace function public.bump_grid_version_on_hours()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.agenda_day_start is distinct from old.agenda_day_start
     or new.agenda_day_end is distinct from old.agenda_day_end then
    new.grid_version := old.grid_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists events_bump_version_on_hours on public.events;
create trigger events_bump_version_on_hours
  before update on public.events
  for each row execute function public.bump_grid_version_on_hours();

-- Backstop: two sessions can never occupy the same room-slot start, whatever
-- races the application layer loses.
create unique index if not exists agenda_assignments_cell_idx
  on public.agenda_assignments (event_id, track_id, day, start_time);
