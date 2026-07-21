-- Unconference Planner — core schema, RLS, and indexes.
--
-- Design notes:
--   * Organizers are Supabase Auth users. They own events and everything under
--     them; access is enforced by the owner-scoped RLS policies below.
--   * Attendees have NO auth account. They join an event with its code + a
--     free-text name and are identified thereafter by a random `token` (uuid)
--     that the app stores in an httpOnly cookie. All attendee writes go through
--     the SECURITY DEFINER functions in 0002_attendee_rpcs.sql, which validate
--     the token — so the attendee-facing tables need no anon write policies.
--   * The `events` table has NO anon SELECT policy on purpose: event codes must
--     not be enumerable. Attendees read event details only via the
--     `get_event_by_code` RPC.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  location text not null default '',
  start_date date,
  end_date date,
  code text not null unique,
  status text not null default 'draft' check (status in ('draft','proposals','voting','published','archived')),
  agenda_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index attendees_event_idx on public.attendees(event_id);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  attendee_id uuid references public.attendees(id) on delete set null,
  proposer_name text not null,
  title text not null,
  description text not null default '',
  format text,
  duration_minutes int,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index proposals_event_idx on public.proposals(event_id);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  attendee_id uuid not null references public.attendees(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (proposal_id, attendee_id)
);
create index votes_event_idx on public.votes(event_id);
create index votes_proposal_idx on public.votes(proposal_id);

create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null,
  label text not null default '',
  created_at timestamptz not null default now()
);
create index time_slots_event_idx on public.time_slots(event_id);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index tracks_event_idx on public.tracks(event_id);

create table public.agenda_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  proposal_id uuid not null unique references public.proposals(id) on delete cascade,
  slot_id uuid not null references public.time_slots(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (slot_id, track_id)
);
create index agenda_assignments_event_idx on public.agenda_assignments(event_id);

alter table public.events enable row level security;
alter table public.attendees enable row level security;
alter table public.proposals enable row level security;
alter table public.votes enable row level security;
alter table public.time_slots enable row level security;
alter table public.tracks enable row level security;
alter table public.agenda_assignments enable row level security;

-- Events: owner-only. No anon SELECT (codes are not enumerable).
create policy events_owner_select on public.events for select to authenticated using (owner_id = auth.uid());
create policy events_owner_insert on public.events for insert to authenticated with check (owner_id = auth.uid());
create policy events_owner_update on public.events for update to authenticated using (owner_id = auth.uid());
create policy events_owner_delete on public.events for delete to authenticated using (owner_id = auth.uid());

-- Attendees: only the owning organizer can list them.
create policy attendees_owner_select on public.attendees for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- Proposals: publicly readable (attendees browse them); only the organizer
-- moderates directly. Attendee create/edit/delete happen via RPC.
create policy proposals_select_all on public.proposals for select using (true);
create policy proposals_owner_update on public.proposals for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy proposals_owner_delete on public.proposals for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- Votes: publicly readable (live counts). Writes via RPC only.
create policy votes_select_all on public.votes for select using (true);

-- Time slots / tracks / assignments: publicly readable (agenda view);
-- organizer writes.
create policy time_slots_select_all on public.time_slots for select using (true);
create policy time_slots_owner_write on public.time_slots for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy time_slots_owner_update on public.time_slots for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy time_slots_owner_delete on public.time_slots for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

create policy tracks_select_all on public.tracks for select using (true);
create policy tracks_owner_write on public.tracks for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy tracks_owner_update on public.tracks for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy tracks_owner_delete on public.tracks for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

create policy assignments_select_all on public.agenda_assignments for select using (true);
create policy assignments_owner_write on public.agenda_assignments for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy assignments_owner_delete on public.agenda_assignments for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
