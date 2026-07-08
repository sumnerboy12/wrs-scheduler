# Wayman Roofing — Scheduler

A resourcing/Gantt tool for assigning staff to jobs and phases, with a
month/quarter overview and day/week drill-down.

There are a few ways to host this — directly on a Windows PC, as a Docker
container via the command line, or as a TrueNAS SCALE Custom App. Pick one.

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
netsh advfirewall firewall add rule name="Wayman Scheduler" dir=in action=allow protocol=TCP localport=4000
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

## Option C: TrueNAS SCALE Custom App (Apps GUI, no CLI compose)

TrueNAS SCALE's Apps screen (Electric Eel/Fangtooth, 24.10+) can install a
container straight from a pasted YAML file via **Custom App → Install via
YAML**. That importer deploys an existing image — it doesn't build one — so
the image has to be built once first.

1. Copy this project folder onto the NAS anywhere temporary (it's only
   needed for the build), e.g. `/mnt/backup/apps-src/wrs-scheduler`.
2. SSH into TrueNAS, `cd` into that folder, and build the image:

   ```
   docker build -t wrs-scheduler:latest .
   ```
3. Create the persistent data folder (must exist before you install the app):

   ```
   mkdir -p /mnt/backup/config/wrs-scheduler/data
   ```
4. In the TrueNAS web UI: **Apps → Discover Apps → Custom App → Install via
   YAML**. Give it a name (e.g. `wrs-scheduler`) and paste the contents of
   **`truenas-app.yaml`** from this project, then Install.
5. Open `http://<nas-ip>:4000`.

`truenas-app.yaml` already points its volume at
`/mnt/backup/config/wrs-scheduler/data` — if you used a different path in
step 3, edit the `volumes:` line to match before pasting it in. If port 4000
is taken on your NAS, change the `ports:` line the same way (e.g.
`"8080:4000"`).

**Updating after a code change:** rebuild the image with the same command
from step 2 (`docker build -t wrs-scheduler:latest .`), then **stop and
start** the app again from the Apps UI so it picks up the new image. Don't
use the Apps UI's "Update" button for this — it tries to pull the image
from a registry, and `wrs-scheduler:latest` only exists locally, so that
would fail. A stop/start just reuses whatever image is tagged
`wrs-scheduler:latest` locally. The `data/` folder is untouched either way.

## How it works

- **Schedule** — the main Gantt/resourcing view. Toggle between grouping
  by employee or by job, and switch between Quarter/Month/Week/Day zoom levels
  for a high-level overview or a detailed drill-down. Double-click an empty
  slot to create an assignment, double-click an existing bar to edit it, and
  drag bars to reschedule or reassign. Employees booked over 100% on
  overlapping dates are outlined in red.
- **Jobs** — manage jobs (including pipeline/quoted jobs you're pricing) and
  break each one into phases (e.g. Tear-off, Install, Flashing), each with its
  own dates.
- **Employees** — manage your staff list.

## Development mode

For making code changes, run the server and client separately with live
reload:

```
server\run-dev.cmd
client\run-dev.cmd
```

The client dev server runs on port 5173 and proxies API calls to the server
on port 4000.
