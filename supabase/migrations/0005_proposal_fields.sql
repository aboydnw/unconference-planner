-- Configurable proposal form: admin-defined custom fields + JSONB answers.

create table public.proposal_fields (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  field_type text not null check (field_type in ('text', 'longtext', 'select')),
  options jsonb not null default '[]',
  required boolean not null default false,
  position int not null default 0
);
create index proposal_fields_event_idx on public.proposal_fields(event_id);

alter table public.proposal_fields enable row level security;
create policy proposal_fields_select_all on public.proposal_fields for select using (true);
create policy proposal_fields_owner_insert on public.proposal_fields for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy proposal_fields_owner_update on public.proposal_fields for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy proposal_fields_owner_delete on public.proposal_fields for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

alter table public.proposals add column custom_answers jsonb not null default '{}'::jsonb;

-- Extend the attendee write RPCs with a jsonb answers parameter. The functions
-- stay SECURITY DEFINER with default PUBLIC execute (anon calls them), matching
-- migration 0002.
drop function if exists public.submit_proposal(uuid, text, text, text, int);
create function public.submit_proposal(p_token uuid, p_title text, p_description text, p_format text, p_duration int, p_custom jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att attendees%rowtype;
  v_event events%rowtype;
  v_id uuid;
begin
  select * into v_att from attendees where token = p_token;
  if not found then raise exception 'ATTENDEE_NOT_FOUND'; end if;
  select * into v_event from events where id = v_att.event_id;
  if v_event.status <> 'proposals' then raise exception 'PROPOSALS_CLOSED'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  insert into proposals (event_id, attendee_id, proposer_name, title, description, format, duration_minutes, custom_answers)
  values (v_event.id, v_att.id, v_att.name, trim(p_title), coalesce(p_description, ''), nullif(trim(coalesce(p_format, '')), ''), p_duration, coalesce(p_custom, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

drop function if exists public.update_own_proposal(uuid, uuid, text, text, text, int);
create function public.update_own_proposal(p_token uuid, p_proposal uuid, p_title text, p_description text, p_format text, p_duration int, p_custom jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att attendees%rowtype;
  v_prop proposals%rowtype;
  v_status text;
begin
  select * into v_att from attendees where token = p_token;
  if not found then raise exception 'ATTENDEE_NOT_FOUND'; end if;
  select * into v_prop from proposals where id = p_proposal and attendee_id = v_att.id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;
  select status into v_status from events where id = v_prop.event_id;
  if v_status <> 'proposals' then raise exception 'PROPOSALS_CLOSED'; end if;
  update proposals
  set title = trim(p_title), description = coalesce(p_description, ''), format = nullif(trim(coalesce(p_format, '')), ''), duration_minutes = p_duration, custom_answers = coalesce(p_custom, '{}'::jsonb)
  where id = p_proposal;
end;
$$;
