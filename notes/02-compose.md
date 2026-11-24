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
