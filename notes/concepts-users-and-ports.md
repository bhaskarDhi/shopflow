# Concepts: Linux users + ports (Docker)

Simple notes. Read top to bottom.

---

## Part 1: Linux users

### 1.1 A user = a number (UID)

Linux knows users by **number**. The name is only a label for humans.

| UID | Who | Example |
|---|---|---|
| **0** | **root** (can do everything ⚠️) | `root` |
| **1 – 999** | **service users** (programs, nobody logs in) | `www-data`=33, `nginx`=101, `postgres` |
| **1000 +** | **people** (who log in) | `ubuntu`=1000, also `node`=1000 in the node image |

Only one rule matters for security: **0 = root = danger. Any other number = limited = good.**

### 1.2 Commands

| Question | Command |
|---|---|
| Who am I? | `whoami` · `id` |
| Who is user X? | `id X` · `getent passwd X` |
| All users? | `cat /etc/passwd` |
| Which user runs a program? | `ps -eo user,pid,cmd` |
| Which user does an image use? | `docker image inspect <image> --format '{{.Config.User}}'` (empty = **root**) |

`getent passwd www-data` → `www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin`
= name : x : **UID** : GID : description : home : **shell** (`nologin` = a service user)

### 1.3 Users in a Dockerfile

| Dockerfile         | Who runs the app                                                                 |
| ------------------ | -------------------------------------------------------------------------------- |
| **no** `USER` line | **root** (even if a `node` user exists in the image!)                            |
| `USER 1000`        | user 1000 ✅                                                                      |
| `USER node`        | works in Docker, but k8s (`runAsNonRoot`) can't check a **name** → pod refused ❌ |

Base image `nginx-unprivileged` already has `USER 101` inside → my image inherits it.
**Rule: always write `USER <number>` myself.**

### 1.4 Two kinds of "user" (don't mix them!)

| Kind | Lives in | Example | Used for |
|---|---|---|---|
| **Linux user** | the OS (`/etc/passwd`) | `root`, `postgres` | who **runs** a program |
| **Database user** | inside Postgres | `shopflow` (from `.env`) | who **logs in** to the DB |

In the db container:
- `docker compose exec db id` → **root** = **me**, entering through `exec` (the image has no `USER`)
- `docker compose exec db ps -o user,pid,args` → **postgres** = the server program
- `docker compose exec db psql -U shopflow -c '\du'` → the **DB** users

Like Apache on Ubuntu: the main process starts as root, then the work runs as a normal user (`www-data` / `postgres`).

---

## Part 2: Ports

### 2.1 Ports below 1024 need root

| Port | Who can listen |
|---|---|
| **< 1024** (80, 443) | only **root** |
| **≥ 1024** (3000, 8080) | any user |

So **non-root nginx** listens on **8080** inside, not 80.

### 2.2 `ports:` = a door from my Mac into a container

```
"127.0.0.1 : 8080 : 8080"
   Mac IP   Mac door   inside port
```

| Part | Meaning |
|---|---|
| `127.0.0.1` | only my Mac can use the door (not the Wi-Fi) |
| left number | the door on **my Mac** |
| right number | where the app listens **inside** the container |

`"80:8080"` works too: **Docker** opens Mac port 80 (Docker has permission), nginx stays on 8080 inside.
Hotel picture: the manager (Docker) opens the main door 80, the guest (nginx) stays in room 8080.
I use `8080:8080` locally: same number in and out, fewer conflicts. Ports 80/443 are for production (k8s Ingress).

### 2.3 Every container has its own ports

```
worker  → 8080 inside     (no Mac door)
web     → 8080 inside     ← Mac door 127.0.0.1:8080
api     → 3000 inside     ← Mac door 127.0.0.1:3000
redis   → 6379 inside     ← Mac door 127.0.0.1:6379
db      → 5432 inside     ← Mac door 127.0.0.1:5433 (Mac 5432 = Homebrew Postgres)
```

| Where | Same port twice? |
|---|---|
| inside **different** containers | ✅ OK (2 houses, both have room 8) |
| on **my Mac** (left side of `ports:`) | ❌ only 1 program per door → `port is already allocated` |

### 2.4 Who talks to whom

| From → to | Address | Needs `ports:`? |
|---|---|---|
| container → container | **service name : inside port** (`db:5432`, `api:3000`, `redis:6379`, `worker:8080`) | ❌ no |
| my Mac → container | `localhost : Mac door` (`localhost:8080`, `localhost:5433`) | ✅ yes |

**Inside a container, `localhost` = that container itself**, not my Mac and not another container.
→ worker without `DB_HOST: db` tried `localhost` → found nothing → orders stayed `pending`.

Proof: the db Mac door is **5433**, but api/migrate use **`db:5432`** → containers never go through the Mac.
Using `5433` inside compose → `ECONNREFUSED`.

### 2.5 `ports:` vs `EXPOSE`

| In `docker compose ps` | Meaning |
|---|---|
| `127.0.0.1:8080->8080/tcp` | `ports:` → a **real** door on my Mac |
| `8080/tcp` (no arrow) | only `EXPOSE` from the Dockerfile → information, **no** door |

### 2.6 "Port already in use"

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN     # who is using the port?
```
Fix: stop that program, or change only the **left** (Mac) port.
