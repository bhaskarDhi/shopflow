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
