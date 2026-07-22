# Rostr

A resourcing/Gantt tool for assigning staff to jobs and phases, with a
month/quarter overview and day/week drill-down.

There are a couple of ways to host this — directly on a Windows PC, or as a
Docker container via the command line (any NAS/Linux box). Pick one.

## Option A: Run on a Windows PC (no Docker)

### First-time setup (on the machine that will host this)

Double-click **`install.cmd`**. This installs the server and client
dependencies. Only needs to be done once (or again after pulling code
updates).

### Running it day-to-day

Double-click **`start.cmd`**. It builds the web app and starts one server on
port 4000. Leave the window open — closing it stops the app.

- On the hosting computer: http://localhost:4000
- From any other computer on the office network: `http://<hosting-computer-name-or-IP>:4000`
  (find the IP with `ipconfig` on the hosting machine)

The first time you run this, Windows Firewall may need an inbound rule to let
other computers reach port 4000. As an administrator:

```
netsh advfirewall firewall add rule name="Rostr" dir=in action=allow protocol=TCP localport=4000
```

### Data (Windows install)

All data (employees, jobs, phases, assignments) lives in a single SQLite file
at `server/data/scheduler.db`. Back this file up periodically (copy it
somewhere safe) — there is no other copy of the data.

## Option B: Run in Docker via the command line (any NAS/Linux box)

The whole app (API + web client) runs as a single container on port 4000.

### Deploy

1. Copy this whole project folder onto the NAS (e.g. via the NAS's file
   share/SMB, `scp`, or `git clone` if it's in a repo).
2. SSH into the NAS, `cd` into the project folder, and run:

   ```
   docker compose up -d --build
   ```

   This builds the image directly on the NAS (so it always matches the NAS's
   CPU architecture — x86_64, ARM, whatever it is) and starts the container
   in the background.
3. Open `http://<nas-ip>:4000` from any computer on the network.

If port 4000 is already used by something else on the NAS, edit the `ports:`
line in `docker-compose.yml` (e.g. `"8080:4000"`) before running the command
above, then browse to that port instead.

### Data (Docker install)

The SQLite database lives in a `data/` folder created next to
`docker-compose.yml` on the NAS (bind-mounted into the container). It
persists across container restarts and rebuilds — back up that `data/`
folder periodically, there is no other copy.

### Updating after a code change

```
docker compose up -d --build
```

Rebuilds the image and replaces the running container. The `data/` folder is
untouched, so nothing is lost.

### Stopping

```
docker compose down
```

## Logging in

The app requires a login. The first time it starts with an empty database, it
creates an initial admin account and prints its username and a random
temporary password to the server's console/log output — look there (the
`start.cmd` window, or `docker compose logs`) right after the first run. You'll
be asked to set a real password on first login.

From **Users** (visible to admins only) you can add more logins, promote/demote
admins, deactivate or remove accounts, and reset anyone's password (which
marks their account so they're asked to set a new one on next login). Setting
a user's **Email** also lets them sign in via SSO instead, if it's configured
— see below.

Note: sessions are kept in the server's memory, not the database, so
restarting the app (a rebuild/redeploy, or a Windows reboot) signs everyone
out and they'll need to log in again — nothing else is lost.

## How it works

- **Schedule** — the main Gantt/resourcing view. Toggle between grouping
  by employee or by job, switch between Quarter/Month/Week/Day zoom levels,
  and filter by job status or a search term (job name/code/client). A second
  filter lets you show/hide **Jobs**, **Leave** and **Non-billable** bars
  independently, e.g. to see just who's on leave without job bookings
  cluttering the view. Double-click an empty slot to create an assignment,
  double-click an existing bar (or a job/phase/employee label) to edit it,
  and drag bars to reschedule or reassign. Jobs, leave and non-billable time
  all count against the same 100%-per-day capacity — anyone over that on
  overlapping dates is outlined in red, and any day where estimated +
  assigned staff would exceed available headcount (accounting for leave and
  non-billable time) is shaded amber. A phase marked **Complete** (see Jobs,
  below) is left out of the Schedule, and out of these calculations,
  entirely. In By Job mode, use the collapse/expand-all buttons (top-left of
  the timeline) to fold every job down to its summary row at once.
- **Jobs** — manage jobs (including pipeline/quoted jobs you're pricing) and
  break each one into phases (e.g. Tear-off, Install, Flashing), each with
  its own dates, an optional staff estimate, and an optional supervisor (see
  Summaries, below). **Import** lets you paste a list from a spreadsheet —
  for jobs, or for a selected job's phases, where only a phase name is
  strictly required: set a default start/end date in the import screen and
  any row without its own dates uses that instead. Tick **Complete** on a
  phase once it's finished — it then drops off the Schedule, is left out of
  double-booking/over-capacity calculations, and is no longer included in
  summary emails, while still showing (dimmed) in this phase list for
  reference. Link a job to a client to inherit that client's colour.
- **Clients** — manage your client list and each one's colour — a job's
  colour on the Schedule always comes from its linked client, not the job
  itself.
- **Employees** — manage your staff list; **Import** works here too.
- **Leave** — added from the Schedule's **+ Add Leave** (sick/annual/ACC/
  other, one employee at a time), shown as its own bar and counted against
  the same capacity as job bookings. Can optionally be kept in sync
  automatically from an external payroll/HR system's calendar feed instead
  of entering it by hand — see below.
- **Non-billable time** — training, admin, meetings, or other non-chargeable
  work, added from the Schedule's **+ Add Non-billable** (several employees
  at once, if a whole team's off the tools for the same reason), also
  counted against the same capacity.
- **Summaries** — two tabs. **Employees**: preview each active employee's
  upcoming bookings and leave for a date range (defaults to the next 7 days)
  and email it to them as a weekly schedule. **Supervisors**: the same idea
  per job — emails each job's supervisor (set on the job itself, under Jobs)
  a day-by-day breakdown of who's booked on which phase. Both tabs let you
  edit the email wording (**Edit template**, with placeholders like the
  recipient's name and date range), preview or send an individual message
  first, and set up **Auto-send** to repeat it automatically every week
  (defaults to Fridays at 3pm, off by default; only emails someone who
  actually has something to report; can be switched off again at any time).
  Needs email set up first — see below.

## Emailing weekly summaries (optional)

The Summaries screen can email each employee their upcoming bookings, but
needs an SMTP account configured first — any mailbox that supports SMTP
works (your business email, or a transactional provider like
Resend/SendGrid/Postmark's SMTP endpoint). Without this, Summaries still
works for previewing — sending is just disabled with a clear message.

- **Windows PC install**: copy `server/.env.example` to `server/.env` and
  fill in `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (and `SMTP_PORT`/
  `SMTP_SECURE` if your provider needs something other than the defaults,
  `SMTP_FROM_NAME` for a display name, or `SMTP_REPLY_TO` if replies
  should land somewhere other than `SMTP_FROM`). Restart the app
  (`start.cmd`) after saving it.
- **Docker install**: create a `.env` file next to `docker-compose.yml` with
  the same variables — `docker compose up -d --build` picks it up
  automatically (see the comment in `docker-compose.yml`).

## Syncing leave from an external calendar (optional)

Rostr can periodically pull approved leave in from an external payroll/HR
system and keep matching **Leave** records in sync automatically — created,
updated, or removed as requests change upstream — so you don't have to
double-enter leave that's already tracked somewhere else.

This works with any system that can publish leave as an iCalendar (.ics)
feed URL (what's actually been tested is Lentune's feed, but nothing about
it is specific to Lentune). Matching is by employee **name** (exact,
case-insensitive) — the feed carries no email or id — so a name Rostr can't
match to an employee is simply skipped rather than guessed at (check the
server's console/log output for a one-line summary, including any
unmatched names, each time it runs). Only leave that's already approved (or
processed by payroll) is imported; draft/submitted requests are left out
since they aren't a commitment yet.

- **Windows PC install**: in `server/.env`, set `LEAVE_CALENDAR_URL` to your
  feed's URL (treat it like a password — it usually embeds an access token
  in the link itself). `LEAVE_SYNC_INTERVAL_MINUTES` controls how often it
  re-checks (defaults to 60). Restart the app after saving.
- **Docker install**: set the same two variables in the `.env` file next to
  `docker-compose.yml`.

A synced leave record can still be edited or deleted by hand in Rostr like
any other. Editing one marks it as manually corrected, so future syncs
recognise it and leave it alone rather than overwriting your correction.
Deleting one just removes it — if the upstream request is still there next
time the sync runs, it'll come back.

## Signing in with SSO (optional)

The login screen can show a "Sign in with SSO" button backed by any OpenID
Connect provider — Microsoft Entra ID (Azure AD) is a natural fit if your
team already has Microsoft 365 accounts. Without this configured, only the
username/password login shows.

SSO does **not** create accounts on its own: a matching user must already
exist under **Users** with its **Email** set to that person's identity
provider email (case-insensitive) — this keeps account provisioning under
your control rather than letting anyone with an org email in.

To set it up:

1. Register an application with your identity provider and set its redirect
   URI to `https://<your-rostr-url>/api/auth/oidc/callback` (or
   `http://localhost:4000/api/auth/oidc/callback` for local testing).
2. Fill in `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
   `OIDC_REDIRECT_URI` the same way as the SMTP variables above (see
   `server/.env.example` for the exact Entra ID issuer URL format).
3. Set each user's **Email** under Users to match their provider account.

Local username/password logins keep working alongside SSO — useful as a
fallback if the identity provider is ever unreachable.

## Development mode

For making code changes, run the server and client separately with live
reload:

```
server\run-dev.cmd
client\run-dev.cmd
```

The client dev server runs on port 5173 and proxies API calls to the server
on port 4000.
