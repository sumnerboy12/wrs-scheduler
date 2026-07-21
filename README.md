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
marks their account so they're asked to set a new one on next login).

Note: sessions are kept in the server's memory, not the database, so
restarting the app (a rebuild/redeploy, or a Windows reboot) signs everyone
out and they'll need to log in again — nothing else is lost.

## How it works

- **Schedule** — the main Gantt/resourcing view. Toggle between grouping
  by employee or by job, and switch between Quarter/Month/Week/Day zoom levels
  for a high-level overview or a detailed drill-down. Double-click an empty
  slot to create an assignment, double-click an existing bar to edit it, and
  drag bars to reschedule or reassign. Employees booked over 100% on
  overlapping dates are outlined in red.
- **Jobs** — manage jobs (including pipeline/quoted jobs you're pricing) and
  break each one into phases (e.g. Tear-off, Install, Flashing), each with its
  own dates. Link a job to a client to inherit that client's colour.
- **Clients** — manage your client list and each one's colour — a job's
  colour on the Schedule always comes from its linked client, not the job
  itself.
- **Employees** — manage your staff list.
- **Summaries** — preview each active employee's bookings for a date range
  (defaults to the next 7 days) and email it to them as a weekly schedule.
  The email wording itself is editable (**Edit template**, with a few
  placeholders like the employee's name and date range) and each person's
  message can be previewed individually before anything sends. **Auto-send
  settings** can also schedule this to happen automatically every week
  (defaults to Fridays at 3pm, off by default) — it only emails employees
  who actually have a booking next week, and can be switched off again at
  any time. Needs email set up first — see below.

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

## Development mode

For making code changes, run the server and client separately with live
reload:

```
server\run-dev.cmd
client\run-dev.cmd
```

The client dev server runs on port 5173 and proxies API calls to the server
on port 4000.
