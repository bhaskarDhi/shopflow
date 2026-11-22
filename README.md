# ShopFlow: a small shop for practising industry-standard CI/CD

```
browser ─► web (React, nginx) ─/api─► api (Node/Express :3000) ─► Postgres
                                          │ LPUSH order id
                                          ▼
                                        Redis (queue "orders")
                                          │ BRPOP
                                          ▼
                                       worker (Node) ─► Postgres (order → "processed")
```

**Flow:** you click **Buy** → the api saves the order as `pending` and puts its id on the Redis queue → the worker picks it up and marks it `processed` → the page shows the status change.

Why this shape: it has everything a real system has — a frontend, an API, a **background worker**, a **database**, a **queue/cache**, a **schema migration step**, health checks and metrics.

## Folders

```
services/api/        Express API
  src/app.js         routes (the app gets db + queue from outside → testable)
  src/server.js      starts the app, graceful shutdown on SIGTERM
  src/migrate.js     runs migrations/*.sql once each (a separate step, not on app start)
  migrations/        SQL schema + seed products
  test/              unit tests (node:test + supertest, fakes, no real db needed)
services/worker/     queue consumer
  src/process.js     the work for 1 order (unit-tested)
  src/worker.js      BRPOP loop + tiny health server for the liveness probe
web/                 React + Vite (dev: /api is proxied to :3000)
```

## Endpoints (api)

| Path | Use |
|---|---|
| `GET /healthz` | liveness: the process is alive (no dependencies) |
| `GET /readyz` | readiness: db + Redis reachable (503 if not) |
| `GET /metrics` | Prometheus metrics (`http_requests_total`, `http_request_duration_seconds`, `orders_created_total`, Node defaults) |
| `GET /api/products` | product list |
| `POST /api/orders` `{productId, quantity}` | create an order (201) |
| `GET /api/orders/:id` | order status |

Worker: `GET :8080/` → `ok` (200) or `stuck` (503 if the loop hasn't run for 60 s).

## Settings (env vars)

| Variable | Default | Used by |
|---|---|---|
| `PORT` | 3000 | api |
| `DB_HOST` / `DB_PORT` | localhost / 5432 | api, worker, migrate |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | shopflow | api, worker, migrate |
| `REDIS_URL` | redis://localhost:6379 | api, worker |
| `QUEUE_NAME` | orders | api, worker |
| `HEALTH_PORT` | 8080 | worker |

## Commands

```bash
cd services/api    && npm ci && npm test && npm run lint     # 6 tests
cd services/worker && npm ci && npm test && npm run lint     # 2 tests
cd web             && npm ci && npm run build                # → web/dist/

# run locally (needs a Postgres + Redis, e.g. from your own compose file)
cd services/api && npm run migrate && npm run dev
cd services/worker && npm run dev
cd web && npm run dev            # http://localhost:5173
```

Order matters: **migrate first**, then api + worker.

The DevOps files (Dockerfiles, compose, CI, Terraform, Ansible, Helm, Argo CD) are **not** here on purpose: I write them myself, following [PLAN.md](PLAN.md).
