-- Optimizer + review phase: draft seed/versioning, pinned assignments,
-- attendee unavailability, and the transactional draft-swap function.

alter table public.events
  add column draft_seed bigint,
  add column grid_version int not null default 0;

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft','proposals','voting','review','published','archived'));

alter table public.agenda_assignments
  add column pinned boolean not null default false;
-- Existing assignments were all manually placed → treat as human-touched.
update public.agenda_assignments set pinned = true;

create policy assignments_owner_update on public.agenda_assignments for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

create table public.attendee_unavailability (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  attendee_id uuid not null references public.attendees(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null
);
create index attendee_unavailability_event_idx on public.attendee_unavailability(event_id);
alter table public.attendee_unavailability enable row level security;
create policy attendee_unavailability_select_all on public.attendee_unavailability for select using (true);

-- Attendee replaces their unavailability windows wholesale.
-- p_slots: [{"day":"2026-08-01","start_time":"14:00","end_time":"17:00"}, ...]
create or replace function public.set_unavailability(p_token uuid, p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att attendees%rowtype;
  v_status text;
begin
  select * into v_att from attendees where token = p_token;
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select status into v_status from events where id = v_att.event_id;
  if v_status not in ('proposals', 'voting') then
    raise exception 'EVENT_LOCKED';
  end if;
  delete from attendee_unavailability where attendee_id = v_att.id;
  insert into attendee_unavailability (event_id, attendee_id, day, start_time, end_time)
  select v_att.event_id, v_att.id,
         (x->>'day')::date, (x->>'start_time')::time, (x->>'end_time')::time
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
  where (x->>'end_time')::time > (x->>'start_time')::time;
end;
$$;

-- Organizer swaps the unpinned draft in one transaction. SECURITY INVOKER:
-- RLS on events/agenda_assignments enforces ownership (the events UPDATE
-- matches 0 rows for non-owners, which we turn into an explicit error).
create or replace function public.replace_draft_assignments(p_event uuid, p_seed bigint, p_placements jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update events set draft_seed = p_seed, grid_version = grid_version + 1 where id = p_event;
  if not found then
    raise exception 'NOT_AUTHORIZED';
  end if;
  delete from agenda_assignments where event_id = p_event and pinned = false;
  insert into agenda_assignments (event_id, proposal_id, track_id, day, start_time, pinned)
  select p_event,
         (x->>'proposal_id')::uuid, (x->>'track_id')::uuid,
         (x->>'day')::date, (x->>'start_time')::time, false
  from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) x;
end;
$$;
