-- Priority-tier voting: votes carry a tier (must / would attend).
-- Replaces the binary toggle_vote RPC with set_vote (tier or NULL to clear).

alter table public.votes
  add column if not exists tier text not null default 'would'
    check (tier in ('must','would'));

drop function if exists public.toggle_vote(uuid, uuid);

create or replace function public.set_vote(p_token uuid, p_proposal uuid, p_tier text)
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
  if p_tier is not null and p_tier not in ('must','would') then
    raise exception 'INVALID_TIER';
  end if;
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
  if p_tier is null then
    delete from votes where proposal_id = p_proposal and attendee_id = v_att.id;
  else
    insert into votes (event_id, proposal_id, attendee_id, tier)
    values (v_att.event_id, p_proposal, v_att.id, p_tier)
    on conflict (proposal_id, attendee_id) do update set tier = excluded.tier;
  end if;
end;
$$;
