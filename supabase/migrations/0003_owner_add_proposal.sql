-- Let organizers add session proposals directly (e.g. sessions that come up in
-- conversation before attendees submit them). Attendee inserts still go through
-- the submit_proposal RPC; this policy only covers the authenticated owner.
create policy proposals_owner_insert on public.proposals for insert to authenticated
  with check (
    attendee_id is null
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.owner_id = auth.uid()
    )
  );
