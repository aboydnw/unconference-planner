-- Change requests: attendees propose move/swap/add during review, react 👍,
-- organizer applies or declines. Payloads are session-relative, never cell
-- coordinates. Writes go through RPCs; both tables are publicly readable.

alter table public.proposals
  add column pitched_in_review boolean not null default false;

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  attendee_id uuid references public.attendees(id) on delete set null,
  author_name text not null,
  kind text not null check (kind in ('move','swap','add')),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  other_proposal_id uuid references public.proposals(id) on delete cascade,
  target_day date,
  target_start_time time,
  target_track_id uuid references public.tracks(id) on delete set null,
  rationale text not null default '',
  grid_version int not null,
  status text not null default 'open'
    check (status in ('open','applied','declined','invalidated','expired')),
  invalid_reason text,
  created_at timestamptz not null default now()
);
create index change_requests_event_idx on public.change_requests(event_id);

create table public.change_request_reactions (
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  attendee_id uuid not null references public.attendees(id) on delete cascade,
  primary key (change_request_id, attendee_id)
);

alter table public.change_requests enable row level security;
alter table public.change_request_reactions enable row level security;
create policy change_requests_select_all on public.change_requests for select using (true);
create policy cr_reactions_select_all on public.change_request_reactions for select using (true);
-- Organizer updates directly (decline, sweep, expire); attendee writes via RPC.
create policy change_requests_owner_update on public.change_requests for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- Attendee-side validation needs the grid bounds; expose them (harmless public
-- info) plus grid_version. Return type changes → drop + recreate.
drop function public.get_event_by_code(text);
create or replace function public.get_event_by_code(p_code text)
returns table (id uuid, name text, description text, location text, start_date date, end_date date, status text, agenda_published boolean, agenda_day_start time, agenda_day_end time, grid_version int)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select e.id, e.name, e.description, e.location, e.start_date, e.end_date, e.status, e.agenda_published, e.agenda_day_start, e.agenda_day_end, e.grid_version
  from events e
  where lower(e.code) = lower(trim(p_code)) and e.status <> 'archived';
$$;

create or replace function public.submit_change_request(
  p_token uuid, p_kind text, p_proposal uuid, p_other uuid,
  p_day date, p_start time, p_track uuid, p_rationale text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att attendees%rowtype;
  v_event events%rowtype;
  v_id uuid;
begin
  select * into v_att from attendees where token = p_token;
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select * into v_event from events where id = v_att.event_id;
  if v_event.status <> 'review' then
    raise exception 'NOT_IN_REVIEW';
  end if;
  if p_kind not in ('move','swap','add') then
    raise exception 'INVALID_KIND';
  end if;
  if not exists (select 1 from proposals where id = p_proposal and event_id = v_event.id and hidden = false) then
    raise exception 'PROPOSAL_NOT_FOUND';
  end if;
  if p_kind = 'move' and (p_day is null or p_start is null) then
    raise exception 'TARGET_REQUIRED';
  end if;
  if p_kind = 'swap' and (p_other is null or p_other = p_proposal
      or not exists (select 1 from proposals where id = p_other and event_id = v_event.id and hidden = false)) then
    raise exception 'OTHER_PROPOSAL_NOT_FOUND';
  end if;
  if p_track is not null and not exists (
    select 1 from tracks where id = p_track and event_id = v_event.id
  ) then
    raise exception 'TRACK_NOT_FOUND';
  end if;
  insert into change_requests (event_id, attendee_id, author_name, kind, proposal_id, other_proposal_id, target_day, target_start_time, target_track_id, rationale, grid_version)
  values (v_event.id, v_att.id, v_att.name, p_kind, p_proposal,
          case when p_kind = 'swap' then p_other else null end,
          p_day, p_start, p_track, coalesce(trim(p_rationale), ''), v_event.grid_version)
  returning id into v_id;
  return v_id;
end;
$$;

-- Pitch a brand-new session during review: proposal + add-CR in one
-- transaction. Interest voting stays closed; 👍s on the CR are its demand signal.
create or replace function public.submit_review_session(
  p_token uuid, p_title text, p_description text, p_format text, p_duration int,
  p_custom jsonb, p_day date, p_start time, p_track uuid, p_rationale text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att attendees%rowtype;
  v_event events%rowtype;
  v_prop uuid;
  v_id uuid;
begin
  select * into v_att from attendees where token = p_token;
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select * into v_event from events where id = v_att.event_id;
  if v_event.status <> 'review' then
    raise exception 'NOT_IN_REVIEW';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'TITLE_REQUIRED';
  end if;
  if p_track is not null and not exists (
    select 1 from tracks where id = p_track and event_id = v_event.id
  ) then
    raise exception 'TRACK_NOT_FOUND';
  end if;
  if p_duration is not null and (p_duration < 15 or p_duration > 480) then
    raise exception 'INVALID_DURATION';
  end if;
  insert into proposals (event_id, attendee_id, proposer_name, title, description, format, duration_minutes, custom_answers, pitched_in_review)
  values (v_event.id, v_att.id, v_att.name, trim(p_title), coalesce(p_description, ''), nullif(trim(coalesce(p_format, '')), ''), p_duration, coalesce(p_custom, '{}'::jsonb), true)
  returning id into v_prop;
  insert into change_requests (event_id, attendee_id, author_name, kind, proposal_id, target_day, target_start_time, target_track_id, rationale, grid_version)
  values (v_event.id, v_att.id, v_att.name, 'add', v_prop, p_day, p_start, p_track, coalesce(trim(p_rationale), ''), v_event.grid_version)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.toggle_cr_reaction(p_token uuid, p_cr uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att attendees%rowtype;
  v_cr change_requests%rowtype;
  v_status text;
begin
  select * into v_att from attendees where token = p_token;
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select * into v_cr from change_requests where id = p_cr and event_id = v_att.event_id;
  if not found then
    raise exception 'CR_NOT_FOUND';
  end if;
  if v_cr.status <> 'open' then
    raise exception 'CR_NOT_OPEN';
  end if;
  select status into v_status from events where id = v_att.event_id;
  if v_status <> 'review' then
    raise exception 'NOT_IN_REVIEW';
  end if;
  if exists (select 1 from change_request_reactions where change_request_id = p_cr and attendee_id = v_att.id) then
    delete from change_request_reactions where change_request_id = p_cr and attendee_id = v_att.id;
    return false;
  else
    insert into change_request_reactions (change_request_id, attendee_id) values (p_cr, v_att.id);
    return true;
  end if;
end;
$$;

-- Author withdraws an open CR (edit = withdraw and resubmit).
create or replace function public.delete_own_change_request(p_token uuid, p_cr uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att attendees%rowtype;
  v_kind text;
  v_proposal uuid;
begin
  select * into v_att from attendees where token = p_token;
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  delete from change_requests
  where id = p_cr and attendee_id = v_att.id and status = 'open'
  returning kind, proposal_id into v_kind, v_proposal;
  -- Withdrawing a pitch must take the session with it; otherwise the proposal
  -- survives unreferenced and the next generated draft schedules it.
  if v_kind = 'add' and v_proposal is not null then
    delete from proposals p
    where p.id = v_proposal
      and p.attendee_id = v_att.id
      and p.pitched_in_review = true
      and not exists (select 1 from agenda_assignments a where a.proposal_id = p.id);
  end if;
end;
$$;

-- Organizer applies a CR. SECURITY INVOKER: RLS enforces ownership everywhere.
-- The events UPDATE takes the row lock (serializes concurrent applies) and acts
-- as an optimistic version check: the TS action validated against
-- p_expected_version and retries on STALE_GRID.
-- p_placements: [{proposal_id, track_id, day, start_time}] — the sessions this
-- CR moves/adds; they are re-inserted pinned (human-touched).
-- p_invalidations: [{id, reason}] — open CRs the new grid makes impossible.
create or replace function public.apply_change_request_tx(
  p_event uuid, p_cr uuid, p_expected_version int,
  p_placements jsonb, p_invalidations jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_version int;
begin
  update events set grid_version = grid_version + 1 where id = p_event
  returning grid_version into v_version;
  if not found then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_version <> p_expected_version + 1 then
    raise exception 'STALE_GRID';
  end if;
  delete from agenda_assignments
  where event_id = p_event and proposal_id in (
    select (x->>'proposal_id')::uuid from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) x);
  insert into agenda_assignments (event_id, proposal_id, track_id, day, start_time, pinned)
  select p_event, (x->>'proposal_id')::uuid, (x->>'track_id')::uuid,
         (x->>'day')::date, (x->>'start_time')::time, true
  from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) x;
  update change_requests set status = 'applied'
  where id = p_cr and event_id = p_event and status = 'open';
  if not found then
    raise exception 'CR_NOT_OPEN';
  end if;
  update change_requests cr
  set status = 'invalidated', invalid_reason = x->>'reason'
  from jsonb_array_elements(coalesce(p_invalidations, '[]'::jsonb)) x
  where cr.id = (x->>'id')::uuid and cr.event_id = p_event and cr.status = 'open';
end;
$$;
