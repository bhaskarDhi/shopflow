# CLAUDE.md: ShopFlow DevOps practice

## Who I am and how to teach me
- DevOps learner. **English is not my first language** → very simple English, short steps, tables, exact commands.
- **One small step at a time.** Too many new keywords at once = I get confused (happened with Ansible register/when). Explain each new keyword in a table.
- **I write the DevOps files myself** (Dockerfiles, compose, CI, Terraform, Ansible, Helm, Argo CD). Claude explains, gives the file when I'm stuck, and **checks** my work when I say "check" (read the files + run safe checks: `helm lint`, `helm template`, `kubectl --dry-run=server`, `terraform validate/plan`, `ansible-playbook --check`). Point out exact line + fix.
- Method that works: "by hand → the same thing in a file" table; compare with what I already did in the todo app.
- Claude keeps **notes for me** in `notes/` — **one file per tool** (01-docker, 02-github-ci, 03-terraform, 04-ansible, 05-helm, 06-argocd, …), only what the pipeline needs. Add to them after each step.
- Before replying to "check"/"resume": look at the real state (git status, files, server, Argo CD) first.
- Remind me to commit + push (I forget). Remind me about AWS cost (stop/destroy the server when I stop).
- Never put secrets in commands → use `read -s`. Never commit `.env`, `*.tfstate`, keys.

## What I already did (todo app: ~/Documents/node, repo bhaskarDhi/note-app-cicd)
React+nginx / Express / Postgres → Dockerfiles (multi-stage, non-root), nginx `/api` proxy, compose + `.env` → GitHub private repo, branches `main`=production `test`=demo, PRs → GitHub Actions builds + pushes `ghcr.io/bhaskardhi/todo-*:{sha,branch}` (amd64) → **Terraform** (key pair, SG with SSH from my IP, EC2 t3.medium Ubuntu 24.04 30 GB, EIP, outputs; local state) → **Ansible** (inventory + ansible.cfg, playbook: packages, 2 GB swap, k3s v1.37.2+k3s1, helm, KUBECONFIG in .bashrc, sealed-secrets chart 2.17.2, Argo CD chart 7.8.13, kubeseal 0.29.0; idempotent with `creates:` / `register`+`when`) → **Helm chart** (db StatefulSet, backend/frontend Deployments, Ingress with nip.io host, values-demo/production, SealedSecrets via `.Files.Glob`) → **Argo CD** (read-only deploy key secret with label `argocd.argoproj.io/secret-type=repository`; app demo = `test` auto-sync, production = `main` manual sync; UI via ssh tunnel + port-forward).

## Gotchas I learned (don't repeat them)
- Mac is **arm64**, EC2/CI are **amd64** → `DOCKER_DEFAULT_PLATFORM=linux/amd64` or build multi-arch.
- Canonical AMI owner id is **099720109477**.
- `creates:` path must be real (`which helm` → `/usr/local/bin/helm`).
- k3s kubectl needs `KUBECONFIG=~/.kube/config` (non-interactive ssh does not read .bashrc).
- Postgres on k3s/Ubuntu needed `appArmorProfile: Unconfined`.
- `helm lint/template` don't catch k8s typos → use `kubectl apply --dry-run=server`. Dry-run doesn't catch **meaning** (wrong image) → `grep image:`.
- A backend with no DB timeout hung forever at 0/1 → always a connection timeout + a **livenessProbe**.
- Sealed Secrets key must be **backed up** (`~/secure/`) or a rebuilt server can't open the sealed files.
- Argo CD only reads **GitHub** → no push = no deploy. A branch must contain the chart path.
- New server = new IP → update inventory, `~/.ssh/config`, Ingress hosts (automate this here).

## Environment
- Mac: terraform 1.17, ansible core 2.21, helm 4.3, kubectl, gh (logged in, `read:packages`), AWS CLI user `terraform-cli`, region **ap-south-1**. SSH keys in `~/.ssh/`.
- The todo app's EC2 (`ssh todo`) may still exist — check cost before creating a second server; this project can reuse it or replace it.

## This project
App code is ready and tested (see README.md). Follow **PLAN.md** phase by phase; start at **Phase 0**.
