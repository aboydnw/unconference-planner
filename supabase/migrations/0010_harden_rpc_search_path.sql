-- Harden every SECURITY DEFINER RPC against temp-schema shadowing.
--
-- `set search_path = public` leaves pg_temp implicitly searched *first* for
-- relations, so anyone able to create temp objects could shadow `attendees` and
-- redirect the token lookup that authorizes the whole attendee surface. Listing
-- pg_temp explicitly, last, is the fix PostgreSQL documents for SECURITY
-- DEFINER functions; unqualified names still resolve to public.
--
-- Applied by loop so it covers the functions shipped in 0002–0009 without
-- restating their signatures, and stays correct if more are added later.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, pg_temp',
      fn.sig
    );
  end loop;
end;
$$;
