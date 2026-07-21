-- Attendee-facing RPCs.
--
-- These run as SECURITY DEFINER so account-less attendees (the `anon` role) can
-- read event details and write proposals/votes without any table-level write
-- policy. Each function that mutates data first resolves and validates the
-- attendee's `token`, so possessing a valid token is the authorization check.
--
-- Supabase's database linter flags these as "anon can execute SECURITY DEFINER"
-- (lint 0028/0029). That is intentional here — do not revoke EXECUTE or the
-- attendee flows stop working.

create or replace function public.get_event_by_code(p_code text)
returns table (id uuid, name text, description text, location text, start_date date, end_date date, status text, agenda_published boolean)
language sql
security definer
set search_path = public
as $$
  select e.id, e.name, e.description, e.location, e.start_date, e.end_date, e.status, e.agenda_published
  from events e
  where lower(e.code) = lower(trim(p_code)) and e.status <> 'archived';
$$;

create or replace function public.join_event(p_code text, p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_att attendees%rowtype;
begin
  select * into v_event from events where lower(code) = lower(trim(p_code)) and status <> 'archived';
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.status = 'draft' then
    raise exception 'EVENT_NOT_OPEN';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  insert into attendees (event_id, name) values (v_event.id, trim(p_name)) returning * into v_att;
  return json_build_object('attendee_id', v_att.id, 'token', v_att.token, 'event_id', v_event.id, 'name', v_att.name);
end;
$$;

create or replace function public.attendee_by_token(p_token uuid)
returns table (id uuid, event_id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select a.id, a.event_id, a.name from attendees a where a.token = p_token;
$$;

create or replace function public.submit_proposal(p_token uuid, p_title text, p_description text, p_format text, p_duration int)
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
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select * into v_event from events where id = v_att.event_id;
  if v_event.status <> 'proposals' then
    raise exception 'PROPOSALS_CLOSED';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'TITLE_REQUIRED';
  end if;
  insert into proposals (event_id, attendee_id, proposer_name, title, description, format, duration_minutes)
  values (v_event.id, v_att.id, v_att.name, trim(p_title), coalesce(p_description, ''), nullif(trim(coalesce(p_format, '')), ''), p_duration)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_own_proposal(p_token uuid, p_proposal uuid, p_title text, p_description text, p_format text, p_duration int)
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
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select * into v_prop from proposals where id = p_proposal and attendee_id = v_att.id;
  if not found then
    raise exception 'PROPOSAL_NOT_FOUND';
  end if;
  select status into v_status from events where id = v_prop.event_id;
  if v_status <> 'proposals' then
    raise exception 'PROPOSALS_CLOSED';
  end if;
  update proposals
  set title = trim(p_title), description = coalesce(p_description, ''), format = nullif(trim(coalesce(p_format, '')), ''), duration_minutes = p_duration
  where id = p_proposal;
end;
$$;

create or replace function public.delete_own_proposal(p_token uuid, p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att attendees%rowtype;
begin
  select * into v_att from attendees where token = p_token;
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  delete from proposals where id = p_proposal and attendee_id = v_att.id;
end;
$$;

create or replace function public.toggle_vote(p_token uuid, p_proposal uuid)
returns boolean
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
  if not found then
    raise exception 'ATTENDEE_NOT_FOUND';
  end if;
  select * into v_prop from proposals where id = p_proposal and event_id = v_att.event_id;
  if not found then
    raise exception 'PROPOSAL_NOT_FOUND';
  end if;
  select status into v_status from events where id = v_att.event_id;
  if v_status not in ('proposals', 'voting') then
    raise exception 'VOTING_CLOSED';
  end if;
  if exists (select 1 from votes where proposal_id = p_proposal and attendee_id = v_att.id) then
    delete from votes where proposal_id = p_proposal and attendee_id = v_att.id;
    return false;
  else
    insert into votes (event_id, proposal_id, attendee_id) values (v_att.event_id, p_proposal, v_att.id);
    return true;
  end if;
end;
$$;
