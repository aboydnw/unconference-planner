-- Availability windows say when someone is away, so they are not public agenda
-- data like proposals and votes. Restrict reads to the owning organizer, and
-- give attendees their own rows back through the usual token-validated RPC.

drop policy if exists attendee_unavailability_select_all on public.attendee_unavailability;

drop policy if exists attendee_unavailability_owner_select on public.attendee_unavailability;
create policy attendee_unavailability_owner_select on public.attendee_unavailability
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

create or replace function public.get_my_unavailability(p_token uuid)
returns table (day date, start_time time, end_time time)
language sql
security definer
set search_path = public
as $$
  select u.day, u.start_time, u.end_time
  from attendee_unavailability u
  join attendees a on a.id = u.attendee_id
  where a.token = p_token
  order by u.day, u.start_time;
$$;
