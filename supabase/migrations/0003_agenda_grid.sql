-- Move the agenda from manual time-slot rows to time-based placements on an
-- auto-generated 30-minute grid, and add full-width blocks (lunch / all-hands).

alter table public.events
  add column agenda_day_start time not null default '09:00',
  add column agenda_day_end time not null default '17:00';

-- Old assignments reference slot rows that no longer exist under the new model.
delete from public.agenda_assignments;

alter table public.agenda_assignments
  drop column slot_id,
  add column day date not null,
  add column start_time time not null;

create table public.agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null,
  label text not null default ''
);
create index agenda_blocks_event_idx on public.agenda_blocks(event_id);

alter table public.agenda_blocks enable row level security;
create policy agenda_blocks_select_all on public.agenda_blocks for select using (true);
create policy agenda_blocks_owner_insert on public.agenda_blocks for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy agenda_blocks_owner_delete on public.agenda_blocks for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

drop table public.time_slots cascade;

-- Allow event owners to add sessions directly (organizer-authored proposals).
create policy proposals_owner_insert on public.proposals for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
