# 01 · Docker (Phase 1)

## Step 1: api image ✅

```dockerfile
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
EXPOSE 3000
USER 1000
HEALTHCHECK --interval=30s --timeout=3s CMD ["wget", "-qO-", "http://localhost:3000/healthz"]
CMD ["node", "src/server.js"]
```

| Rule | Why |
|---|---|
| `ENV KEY=value` (with `=`) | `ENV key value` is the old format. Env names are **case-sensitive** (`PORT` ≠ `port`) |
| rarely-changed lines on top (`package.json`, `npm ci`), code at the bottom | **layer cache**: a changed file re-runs its line **and every line after it** |
| `USER 1000` (number), not `USER node` | k8s `runAsNonRoot: true` can only verify a number (hadolint DL3066) |
| `CMD ["node", ...]` (JSON form), not `npm start` | node = PID 1 → gets **SIGTERM** → graceful shutdown runs |
| `HEALTHCHECK CMD [...]` JSON form | hadolint DL3025. Any non-zero exit = unhealthy. **k8s ignores HEALTHCHECK** (uses probes) |
| copy `migrations` into the same image | migrate = same image, other command: `docker run shopflow-api node src/migrate.js` |

### `.dockerignore`

```
node_modules
.env
*.log
```

`COPY` decides what goes **into the image**. `.dockerignore` decides what is **sent to Docker** (build context). Without it: 28 MB of `node_modules` sent on every build, arm64 files could end up in an amd64 image, and secrets could leak.

### Test

```bash
hadolint Dockerfile                                     # no output = OK
docker build -t shopflow-api:dev .
docker run -d --name api-test --health-interval=2s -p 3000:3000 shopflow-api:dev
curl localhost:3000/healthz        # 200 ok         (alive)
curl localhost:3000/readyz         # 503 not ready  (no DB → correct)
docker inspect -f '{{.State.Health.Status}}' api-test   # healthy
docker exec api-test id -u          # 1000
docker rm -f api-test
```

`--health-interval=2s` overrides the 30 s from the Dockerfile → faster test.

**Mistakes I made:** `nodemodules` (typo → not ignored), `ENV port 3000` (lowercase + old format), `COPY migrations` before `npm ci` (breaks cache).

## Step 2: worker image ✅

Same as the api, with 3 differences:

| | api | worker |
|---|---|---|
| `COPY migrations` | yes | **no** (no migrations folder) |
| `EXPOSE` | 3000 | **8080** (its own health server) |
| `HEALTHCHECK` URL | `/healthz` | `http://localhost:8080/` |
| `CMD` | `src/server.js` | `src/worker.js` |

| Rule | |
|---|---|
| `EXPOSE` = ports the container **listens on** | not the ports it connects to (Redis 6379 is not the worker's port) |
| `COPY src ./src` | → `/app/src/` ✅ |
| `COPY src ./` | → contents into `/app/` (no `src` folder) ❌ |
| hadolint checks **style**, not meaning | look inside: `docker run --rm --entrypoint ls <image> -p /app /app/src` |
| graceful stop | `docker stop` sends SIGTERM → exit code **0** = shutdown code ran; **137** = killed (SIGKILL) after the timeout |

Worker is **healthy without Redis**: the loop catches the error and keeps running → not stuck → restarting would not help.

**Mistakes I made:** `EXPOSE 6379` (Redis port), `COPY src` before `npm ci` again, extra `COPY src ./` (duplicate files).

## Step 3: web image (multi-stage + non-root nginx) ✅

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                       # WITH dev deps: vite is a devDependency
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build                # → /app/dist

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=3s CMD ["wget", "-qO-", "http://127.0.0.1:8080/healthz"]
EXPOSE 8080
```

| Keyword | Meaning |
|---|---|
| multi-stage | many `FROM`; only the **last** stage = the image (no node, no source) |
| `AS build` / `COPY --from=build` | name a stage / copy from it |
| `nginx-unprivileged` | runs as user **101**, port **8080** (ports < 1024 need root) |

`nginx.conf`: `listen 8080` · `location = /healthz { return 200 'ok'; }` · `location /api/ { proxy_pass http://api:3000; }` · `location / { try_files $uri /index.html; }`

`.dockerignore`: `node_modules`, `dist`, `.env`, `*.log`

### Gotchas

| Problem | Why | Fix |
|---|---|---|
| `host not found in upstream "api"` → exit 1 | nginx looks up `proxy_pass` hosts **at start** | compose: `depends_on: api`; k8s: Service name exists; alone: `--add-host api:127.0.0.1` |
| healthcheck `Connection refused` | in this image `localhost` = `::1` (IPv6); `listen 8080` = IPv4 only | use `127.0.0.1` in HEALTHCHECK |
| `FromAsCasing` warning | `FROM ... as` | write `AS` |

Test alone:
```bash
docker run -d --name web-test --add-host api:127.0.0.1 --health-interval=2s -p 8080:8080 shopflow-web:dev
docker inspect -f '{{.State.Health.Status}}' web-test   # healthy
curl localhost:8080/healthz                              # ok;  /api/... → 502 (no api) = expected
```

## Step 4: Dependabot for base images ✅

Add to `.github/dependabot.yml` (under the npm item, same indent):

```yaml
  - package-ecosystem: docker
    directories: ["/services/api", "/services/worker", "/web"]
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore(deps)"
```

Dependabot reads the `FROM` lines → opens a PR when `node:22-alpine` / `nginx-unprivileged` has a newer version. Old base images = many CVEs (Trivy, Phase 4).
