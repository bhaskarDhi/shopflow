# 02 · Compose (Phase 2, local dev)

## Step 1: Postgres + Redis ✅

`compose.yaml` (modern name, no `version:` line) + `.env` (not committed) + `.env.example` (committed, fake values).

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}          # ${X} = value from .env, replaced by compose
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - dbdata:/var/lib/postgresql/data    # named volume: data survives `down`
    ports:
      - "127.0.0.1:5433:5432"              # Mac 5433 (5432 used by Homebrew postgres)
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]   # $$ = keep $ for the container shell
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]   # PONG = healthy; CMD (no shell) because no $
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  dbdata:
```

| Key | Meaning |
|---|---|
| `build: ./folder` | build from **my** Dockerfile (api, worker, web) |
| `image: name:tag` | download a ready image (postgres, redis) |

### Ports

```
"127.0.0.1 : 5433 : 5432"
   Mac IP    Mac port  container port
```

| Rule | |
|---|---|
| `127.0.0.1` | only my Mac can connect (not the Wi-Fi). Redis has no password! |
| change only the **left** port | containers talk to each other on the **inside** port (`db:5432`) |
| `address already in use` | another program has the port → `lsof -nP -iTCP:5432 -sTCP:LISTEN` → stop it or use another left port |
| non-root can't listen < 1024 | inside: nginx 8080; outside: `"80:8080"` (Docker opens 80, not nginx) |

### Users (UID)

| UID | |
|---|---|
| 0 | root |
| 1–999 | system/service users (`www-data`=33, `nginx`=101, `postgres`) |
| 1000+ | people (`ubuntu`=1000) — also the `node` image user |

Commands: `id`, `whoami`, `getent passwd <user>`, `ps -eo user,pid,cmd`, `docker image inspect <img> --format '{{.Config.User}}'` (empty = root).
No `USER` in the Dockerfile → **root**, even if a `node` user exists.
Postgres image = like Apache: starts as root, the server runs as `postgres` (`docker compose exec db ps -o user,pid,args`). `docker compose exec db id` = root, because `exec` uses the image's default user.

### Test

```bash
docker compose config --quiet && echo OK
docker compose up -d
docker compose ps                                  # (healthy)
docker compose exec db psql -U shopflow -c '\l'
docker compose exec redis redis-cli ping           # PONG
```

**Mistakes I made:** `${POSTGRES_NAME}` but `.env` has `POSTGRES_DB` (→ empty value, compose warns); wrote services from later steps too early.

## Step 2: `migrate` (one-shot service) ✅

```yaml
  migrate:
    build: ./services/api                  # same image as the api
    command: ["node", "src/migrate.js"]    # replaces the image CMD
    environment:
      DB_HOST: db                          # service name = hostname
      DB_PORT: "5432"                      # INSIDE port (not 5433 = Mac door)
      DB_NAME: ${POSTGRES_DB}
      DB_USER: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      db:
        condition: service_healthy         # wait until pg_isready works
    restart: "no"                          # only this container; a job must end
```

| `restart:` | |
|---|---|
| `"no"` (default) | one-shot jobs (quotes: `no` without quotes = false) |
| `always` / `unless-stopped` | servers |
| `on-failure` | retry only when exit code ≠ 0 |

### Where the data lives

`migrate` container (code only) → sends SQL → `db` container (Postgres program) → saves in the **`dbdata` volume**.

| Command | Data |
|---|---|
| restart db / run migrate again / `down` + `up` | ✅ kept |
| `docker compose down -v` | ❌ **deleted** (volume removed) |

### Migration rules

| Rule | |
|---|---|
| `schema_migrations` remembers applied files → `skip` | protection 1: the file doesn't run again |
| `CREATE TABLE IF NOT EXISTS` | protection 2: create only if missing, **never changes** an existing table |
| change the DB = a **new file** `002_xxx.sql` (`ALTER TABLE ... ADD COLUMN`) | never edit an applied file |

```bash
docker compose up migrate           # no -d → watch: applied / skip, "exited with code 0"
docker compose ps -a                # migrate → Exited (0)
docker compose exec db psql -U shopflow -c '\dt'
```

`ECONNREFUSED ...:5433` = used the Mac port inside compose → inside always `db:5432`.

## Step 3: `api` + `worker` ✅

```
db (healthy) ──► migrate (exit 0) ──┬──► api     (127.0.0.1:3000)
redis (healthy) ────────────────────┴──► worker  (no ports)
```

```yaml
  api:
    build: ./services/api
    image: shopflow-api:local              # same name as migrate → 1 image, 2 commands
    environment:
      DB_HOST: db
      DB_PORT: "5432"
      DB_NAME: ${POSTGRES_DB}
      DB_USER: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_URL: redis://redis:6379        # protocol://service-name:inside-port
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      migrate:
        condition: service_completed_successfully   # tables exist first
      redis:
        condition: service_healthy
    restart: unless-stopped
```

Worker = same, but `build: ./services/worker`, `image: shopflow-worker:local`, **no `ports:`** (health 8080 is used inside by HEALTHCHECK).

| `depends_on` condition | Waits until |
|---|---|
| `service_started` (default) | the container started (not ready!) |
| `service_healthy` | its healthcheck passes |
| `service_completed_successfully` | it **exited with code 0** (one-shot jobs) |

**Inside a container, `localhost` = the container itself.** No env → worker defaults to `localhost` → never finds db/redis → orders stay `pending`. Always use the **service name**.

`build:` + `image:` = build and give the image this name (without `image:`, compose names it `<project>-<service>`).

Test a real order:
```bash
docker compose up -d --build
curl localhost:3000/readyz                                     # ready (503 in Phase 1 without db)
curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' -d '{"productId":1,"quantity":2}'
curl localhost:3000/api/orders/1                               # processed
docker compose logs worker                                     # order 1 processed
```

**Mistakes I made:** worker without `environment:`; worker `ports: 8080` (not needed + clashes with web later).
