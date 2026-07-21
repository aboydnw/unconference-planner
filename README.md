# Unconference Planner

A small open-source web app for planning unconference-style events — the kind of
self-organized, agenda-built-by-the-room format that works well for a team week
or onsite. Organizers set up an event; attendees join with a code, pitch
sessions, and vote on what they'd attend; the organizer assembles the schedule
from the highest-signal proposals.

It's built for the pre-event phase: collect and prioritize sessions ahead of
time so you walk in with a draft agenda instead of a blank grid.

## How it works

**Organizers** sign in with email + password, create an event, and move it
through phases:

| Phase | What attendees can do |
| --- | --- |
| Draft | Nothing yet — the event is private to you. |
| Collecting proposals | Join, submit sessions, and vote. |
| Voting open | Submissions closed; voting still open. |
| Agenda published | Everything closed; attendees see the final grid. |
| Archived | Event is over and no longer joinable. |

Organizers also moderate proposals (hide/delete), then build the agenda on a
grid of time slots × rooms — click a session, click a cell to place it.
Publishing the agenda is a separate toggle, so you can build it privately and
reveal it when ready.

**Attendees** never make an account. They open a share link (`/e/<CODE>`),
enter a name, and are remembered on that browser via an httpOnly cookie. They
submit proposals, browse everyone else's, and mark "I'd attend" on the ones they
want (a binary, RSVP-style signal that tells the organizer expected room sizes).

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + **TypeScript**
- **Chakra UI v3** for the interface
- **Supabase** (Postgres + Auth) for data and organizer auth
- **yarn** (node-modules linker)

There's no separate backend — data access is server components + server actions
talking to Supabase directly, with security enforced in the database.

### Security model

- **Organizer data** (events, attendee lists, agenda edits) is protected by
  Row Level Security policies scoped to `owner_id = auth.uid()`.
- **Attendees have no login.** Everything they do goes through a handful of
  `SECURITY DEFINER` Postgres functions (`join_event`, `submit_proposal`,
  `toggle_vote`, `delete_own_proposal`, …). Each one validates the attendee's
  random `token` before touching data, so holding a valid token *is* the
  authorization check. This keeps the service-role key out of the app entirely.
- The `events` table has **no anonymous read policy**, so event codes can't be
  scraped. Attendees resolve an event only by calling `get_event_by_code` with a
  code they already have.

This is trust-based within a team (an attendee who clears cookies can rejoin
under a new name), which is appropriate for the unconference use case. See the
notes in `supabase/migrations/0001_initial_schema.sql`.

## Running it locally

You need a Supabase project (the free tier is plenty).

1. **Create the database.** Apply the two migrations in `supabase/migrations/`
   to your project — via the Supabase SQL editor (paste each file), or the
   Supabase CLI (`supabase db push`).

2. **Configure env.** Copy `.env.example` to `.env.local` and fill in your
   project URL and anon/publishable key (Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

3. **Install and run.**

   ```bash
   yarn install
   yarn dev
   ```

   Open http://localhost:3000.

4. **Make an organizer account.** By default Supabase requires email
   confirmation on sign-up. For local testing, either turn off "Confirm email"
   under Authentication → Providers → Email, or use a real address and click the
   confirmation link. Then sign in at `/login`.

### Recommended Supabase settings

- Enable **leaked-password protection** (Authentication → Policies) so organizer
  passwords are checked against HaveIBeenPwned.
- Set your site URL / redirect URLs under Authentication → URL Configuration to
  match wherever you deploy.

## Deploying

Any Next.js host works. For Vercel: import the repo, add the two
`NEXT_PUBLIC_SUPABASE_*` environment variables, and deploy. Point your
Supabase auth URL configuration at the deployed domain.

## Project status

This is an experimental v1. Deliberately out of scope for now: room
capacity/equipment modeling, email invites and reminders, a live day-of agenda
board, and post-event notes. The schema leaves room for them without a rewrite.
