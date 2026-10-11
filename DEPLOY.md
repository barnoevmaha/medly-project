# Deploying Medly

**Everything on Railway: two services, one repository, one project.**

Both halves ship as Docker images. Railway builds them from the Dockerfiles in
`backend/` and `frontend/`, so there is no platform-specific configuration to
maintain and the same images run locally under `docker compose`.

| Service | Root directory | What it is |
|---|---|---|
| API | `backend` | FastAPI in a container, with a volume for SQLite |
| Web | `frontend` | The Vite build served by nginx |

Deploy the API first — the web service needs its URL.

> One service will not work. The frontend has to be built and served separately
> from the API, and they need different root directories.

---

## Run it locally first

```bash
docker compose up --build
```

API on <http://localhost:8000> (docs at `/docs`), web on <http://localhost:5173>.
The database seeds itself on first boot, so you can sign straight in with
`student@medly.dev` / `medly1234`.

If this works locally, Railway will almost certainly work too — it is building
the same two Dockerfiles. Debugging here is far faster than debugging in a
deploy log.

---

## Push to GitHub

```bash
git init
git add .
git commit -m "Medly — AI safety training for medical education"
git branch -M main
git remote add origin https://github.com/<you>/medly.git
git push -u origin main
```

`.gitignore` already excludes `.venv/`, `node_modules/`, `*.db` and `.env`.
Run `git status` before the first push and confirm no `.env` or `medly.db` is
staged — the database contains password hashes.

---

## Step 1 — the API service

1. **New Project → Deploy from GitHub repo**, pick the repo.
2. **Settings → Root Directory**: `backend`
   Railway then finds `backend/railway.json` and builds the Dockerfile.
3. **Variables**:

   | Variable | Value |
   |---|---|
   | `MEDLY_ENV` | `production` (also the default when unset) |
   | `MEDLY_SECRET_KEY` | at least 32 random characters — `openssl rand -hex 32` |
   | `MEDLY_SEED_ON_STARTUP` | `true` |
   | `MEDLY_DATABASE_URL` | `sqlite:////app/data/medly.db` |
   | `MEDLY_SEED_DEMO_USERS` | `true` only for a public demo that needs the demo accounts |

   The API refuses to start outside `MEDLY_ENV=dev` while `MEDLY_SECRET_KEY` is
   missing, the built-in default, or shorter than 32 characters — the deploy
   log names the variable and how to generate one.

   Demo accounts (`student@medly.dev` and the rest, password `medly1234`) are
   created only in dev or with `MEDLY_SEED_DEMO_USERS=true`. Without them the
   teacher-verified casebook is not seeded either, since every case is signed
   off by the demo instructor. The demo premium checkout
   (`POST /api/profile/premium`) works only in dev.

   Four slashes after `sqlite:` — three is a relative path, four is absolute.
   The wrong one puts the database somewhere the volume does not cover.

4. **Settings → Volumes → Add Volume**, mount path `/app/data`.

   Do not skip this. Without a volume the container filesystem is discarded on
   every redeploy, taking the database with it — including any account a judge
   creates while testing.

5. **Settings → Networking → Generate Domain.** Copy the URL.

   **Set the target port to match what the container is listening on.** Railway
   injects its own `PORT` variable, which overrides the Dockerfile's default —
   so both services usually end up on **8080**, not 8000 and 80. The deploy log
   tells you: look for `Uvicorn running on http://0.0.0.0:<port>`.

   If the domain's target port and that number disagree you get *"Application
   failed to respond"* with healthy-looking logs, because the app is fine and
   the edge is knocking on the wrong door.

### Check it before moving on

```bash
curl https://<api-domain>/api/health
```

Expect `{"status":"ok", ...}`, and `https://<api-domain>/docs` should render the
interactive API docs. Do not continue until both work — debugging the frontend
against a broken API wastes far more time than checking here.

In the deploy logs you should also see `Seed complete.` followed by the four
demo accounts. If it is missing, the seed did not run and nobody can sign in.

---

## Step 2 — the web service

1. In the **same project**: **New → GitHub Repo**, same repository.
2. **Settings → Root Directory**: `frontend`
3. **Variables**:

   | Variable | Value |
   |---|---|
   | `MEDLY_API_UPSTREAM` | the API domain, e.g. `https://medly-api.up.railway.app` |

   Include `https://`. The container refuses to start without it, and says so
   in the deploy log.

   nginx in this service proxies `/api/` to that address, so the browser only
   ever talks to the web domain. That matters: two `*.up.railway.app` domains
   are different *sites* to a browser, and the API's refresh-token cookie
   would be third-party — Safari and Brave block those, signing users out
   every 15 minutes. Through the proxy the cookie is first-party everywhere.

   Leave `MEDLY_API_URL` unset. It exists only to bypass the proxy.
4. **Settings → Networking → Generate Domain.**

---

## Step 3 — tighten the cookie (optional)

The browser reaches the API on the web domain, so CORS is not involved and
`MEDLY_CORS_ORIGINS` needs no change. On the **API** service you can set

```
MEDLY_REFRESH_COOKIE_SAMESITE = lax
```

The default outside dev is `none`, which is only needed when a frontend calls
the API from another site (`MEDLY_API_URL` pointing elsewhere — then that
frontend's origin must also be listed in `MEDLY_CORS_ORIGINS`). With the proxy,
`lax` works and is stricter.

---

## Verify the demo end to end

Open the web domain and walk the actual demo, not just the login page:

1. Sign in as `student@medly.dev` / `medly1234`.
2. Go to **Imaging**, create a case, record a reading, hit **Run analysis** —
   expect the 403 panel. That is the certification gate working in production.
3. Sign in as `certified@medly.dev`, repeat, and the model runs.
4. Open **Governance** and confirm your decision appears in the audit trail.
5. Refresh the page while on `/imaging`. It should load, not 404 — nginx is
   configured to fall back to `index.html` for client-side routes.

If login returns a network error or a 502, the proxy cannot reach the API.
The web service's deploy log prints `proxying /api/ to …` at start; that
address should open `/api/health` in a browser.

If login returns "Incorrect email or password", the demo accounts do not exist.
They are created only with `MEDLY_SEED_DEMO_USERS=true` (and
`MEDLY_SEED_ON_STARTUP=true`) on the API service — check both and the deploy
logs.

---

## Which database?

SQLite, Postgres and MySQL all work, and switching is one environment variable —
`db.py` rewrites whatever URL the provider gives you into one naming a driver
that is actually installed.

**Pick SQLite unless you have a reason not to.** MySQL in particular buys you
nothing here: it is a second service to keep running, and the schema uses no
MySQL-specific anything.

|  | SQLite + volume | Railway Postgres |
|---|---|---|
| Setup | Mount a volume at `/app/data` | Add the database, paste one variable |
| Survives redeploys | Yes, if the volume is mounted | Yes |
| Replicas | One only — a volume attaches to a single instance | Any number |
| Backups | Yours to arrange | Managed by Railway |
| Inspect the data | SSH into the container | Any Postgres client |
| Cost | None | Counts against your usage |

**For a hackathon demo, SQLite with a volume is the right call.** One less
service to explain, no connection limits to hit while judges click around, and
nothing in this data model needs Postgres.

Move to Postgres when you want more than one instance, want backups you did not
write yourself, or want to open the data in a GUI.

### Switching to Postgres

1. In your Railway project: **New → Database → Add PostgreSQL.**
2. On the **API** service, set:

   ```
   MEDLY_DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```

   Type it exactly like that — Railway's variable-reference syntax resolves it
   at deploy time, so credentials never sit in your dashboard as plain text and
   they follow the database if it is recreated.
3. Redeploy. `MEDLY_SEED_ON_STARTUP=true` fills the empty database on first boot.
4. The volume at `/app/data` is now unused. Leave it or remove it.

`psycopg[binary]` is already in `requirements.txt`, and `db.py` rewrites
Railway's `postgres://` scheme to the one SQLAlchemy expects, so there is no code
change. It also enables `pool_pre_ping`, without which the first request after
an idle period fails on a connection the database has already closed.

Nothing migrates automatically — switching gives you an empty database, not a
copy of your SQLite one. Fine here, since the seed rebuilds everything except
accounts created during a demo.

---

## Troubleshooting

**`Invalid value for '--port': '$PORT' is not a valid integer`**

Something is starting uvicorn without a shell, so `$PORT` is passed through as a
literal four-character string instead of being expanded.

Check the API service's **Settings → Deploy → Custom Start Command** is empty,
and that `backend/railway.json` has no `startCommand`. Both must be absent. The
Dockerfile's `CMD` already handles this correctly:

```dockerfile
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

The `sh -c` is the part that matters — it gives you a shell to do the expansion,
and `:-8000` means it still runs when `PORT` is unset. Anything that overrides
this line reintroduces the bug.

**"Application failed to respond" but the deploy log looks healthy**

The commonest cause by a distance. The container is listening on one port and
the public domain is routing to another.

Both services read `$PORT`: the API through `uvicorn --port ${PORT:-8000}`, the
web service through `listen ${PORT};` in `nginx.conf`. Railway injects `PORT`
itself — usually **8080** — which overrides the Dockerfile defaults of 8000 and
80. If the domain was generated with a target port of 8000 or 80, nothing
answers there.

Fix: **Settings → Networking → edit the domain → Target Port → 8080**, on both
services. No redeploy needed; the edge reroutes in seconds. Confirm against the
log line `Uvicorn running on http://0.0.0.0:<port>` rather than guessing.

**Healthcheck fails but the logs look fine**

Same root cause, one layer down: Railway is probing a port nothing is bound to.
Check that the startup log's port matches the `PORT` variable on the service.

**`ModuleNotFoundError: No module named 'MySQLdb'`**

`MEDLY_DATABASE_URL` is pointing at a MySQL database — you added MySQL rather
than PostgreSQL from Railway's database list. MySQL now works (`db.py` rewrites
the URL to use PyMySQL, which is installed), so redeploying is enough.

But consider whether you want MySQL at all. For this project the ranking is
SQLite, then Postgres, then MySQL — see the section above. To go back to SQLite,
set `MEDLY_DATABASE_URL=sqlite:////app/data/medly.db`, mount the volume, and
delete the database service.

**`no such table: users`**

`init_db()` did not run, or it ran against a different file than the one being
queried. Almost always the SQLite path: `sqlite:////app/data/medly.db` needs
four slashes.

---

## Notes worth knowing

**`MEDLY_SEED_ON_STARTUP=true` re-runs the seed on every boot.** It is
idempotent — existing courses, quizzes and users are skipped — so it is safe to
leave on, and it means a wiped volume repairs itself.

**Python 3.13, not 3.14.** The API image pins `python:3.13-slim` deliberately.
On 3.14 several dependencies have no prebuilt wheel, so pip tries to compile
pydantic-core with Rust and the build fails. Locally, build your virtualenv the
same way:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

**Set `MEDLY_SECRET_KEY`.** The default in `config.py` is a fixed development
string; anyone who reads the repo could mint valid tokens for any account with
it. That is why the API will not start with it outside `MEDLY_ENV=dev`.
Changing the key signs everyone out of their access tokens; refresh tokens are
stored server-side and survive it.

**`frontend/vercel.json` is unused here.** It is left in place so the frontend
can be hosted on Vercel without changes; Railway ignores it entirely. Delete it
if the clutter bothers you.
