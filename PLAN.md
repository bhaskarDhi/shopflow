# PLAN: industry-standard CI/CD with ShopFlow

Same pipeline as the todo app, done **the way companies do it**. Each phase: what's new vs the todo app.

```
code → PR → CI (lint, test, scan, build multi-arch, sign) → GHCR
                                     │ bot opens a PR in the GitOps repo (new image tag)
                                     ▼
          shopflow-gitops repo ──► Argo CD ──► k3s: dev (auto) → staging (auto) → prod (approval)
          Terraform builds the server, Ansible sets it up, Prometheus/Grafana watch it
```

| # | Phase | New vs the todo app | Status |
|---|---|---|---|
| 0 | **Repo rules** | branch protection on `main` (PR + green CI required), Conventional Commits, `CODEOWNERS`, Dependabot | ☐ |
| 1 | **Containers** | 3 images; multi-stage + non-root + `HEALTHCHECK`; migration as its own command; `hadolint` | ☐ |
| 2 | **Local dev** | `compose.yaml` with Postgres + Redis + a one-shot `migrate` service (`depends_on: service_completed_successfully`) | ☐ |
| 3 | **CI: quality** | jobs per service (monorepo **path filters**), `npm ci` cache, lint + unit tests, **integration test with service containers** (real Postgres/Redis in CI), `concurrency` | ☐ |
| 4 | **CI: supply chain** | `docker buildx` **multi-arch** (amd64 + arm64) with layer cache, **Trivy** scan (fail on HIGH/CRITICAL), **SBOM**, **cosign** keyless signing, tags `sha-<7>` + `vX.Y.Z` (no mutable `latest`) | ☐ |
| 5 | **Releases** | `release-please` (or tags) → versions + CHANGELOG from Conventional Commits | ☐ |
| 6 | **Terraform, properly** | variables + `terraform.tfvars`, outputs, a **module**, **remote state in S3** (with locking), `terraform fmt/validate/tflint` + `plan` on PR in CI | ☐ |
| 7 | **Ansible, properly** | **roles** (`common`, `k3s`, `platform`), `group_vars`, inventory generated from `terraform output`, `ansible-lint`, `--check --diff` | ☐ |
| 8 | **Helm, properly** | `_helpers.tpl` (names/labels), resources requests/limits, liveness ≠ readiness, migration **Job as a Helm hook / Argo sync wave**, HPA, PDB, `securityContext` (non-root, read-only FS), **NetworkPolicy**; `helm lint` + **kubeconform** in CI | ☐ |
| 9 | **GitOps, properly** | a **separate repo** `shopflow-gitops` (app code ≠ deploy config), **app-of-apps**, environments **dev / staging / prod**, image **promotion by PR** (CI bot), prod = manual sync | ☐ |
| 10 | **Secrets** | Sealed Secrets (+ key backup restored by Ansible); stretch: External Secrets + AWS SSM | ☐ |
| 11 | **Observability** | kube-prometheus-stack, **ServiceMonitor** for `/metrics`, a Grafana dashboard as code, **alerts** (error rate, pod restarts, queue not draining); stretch: Loki for logs | ☐ |
| 12 | **Progressive delivery** | **Argo Rollouts** canary for the api (10% → 50% → 100%) with a Prometheus analysis → automatic rollback | ☐ |
| 13 | **Operations** | rollback drill, rebuild-from-zero drill (`terraform destroy/apply` + Ansible + Argo), a runbook | ☐ |

**Server size:** t3.medium is enough up to phase 10. Monitoring (11) and Rollouts (12) need **t3.large** (vertical scaling in Terraform).

**Rule for every phase:** run it by hand once → write the file → test it → write the notes → commit through a PR.
