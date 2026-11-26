# 02 · GitHub Actions CI (Phase 3)

Todo CI only built + pushed images. Here CI first checks **is the code good?** (lint + tests). Build/push = Phase 4.

## Step 1: api job (lint + unit tests) ✅

```yaml
name: ci
on:
  pull_request:              # every PR
  push:
    branches: [main]         # after a merge
permissions:
  contents: read             # minimum rights (read the repo only)
jobs:
  api:                       # job name = check name on the PR ("ci / api")
    runs-on: ubuntu-latest   # a fresh, empty Ubuntu computer
    defaults:
      run:
        working-directory: services/api   # = cd services/api before every run:
    steps:
      - uses: actions/checkout@v5          # = git clone
      - uses: actions/setup-node@v5        # install Node
        with:
          node-version: 22                 # same as the image (node:22-alpine), not my Mac's v26
          cache: npm                       # keep npm downloads for the next run
          cache-dependency-path: services/api/package-lock.json   # lock file not in the root
      - run: npm ci                        # exact lock file (never npm install in CI)
      - run: npm run lint
      - run: npm test
```

| Word | Meaning |
|---|---|
| `uses:` | a ready-made tool (action) |
| `with:` | settings for that tool |
| `run:` | my own shell command |
| a step fails | job **stops**, PR shows ❌ |

### Why not just use the Docker image?

The api image has `npm ci --omit=dev` and no `test/` → **no eslint, no supertest, no tests** inside. Image = the product I ship; CI steps = the quality check before shipping. Runner = the computer both run on. (Alternative: `container: node:22-alpine` on the job.)

### First run (PR #24)

- `api pass 17s` · `# tests 6 # pass 6 # fail 0`
- `npm cache is not found` → first run; cache **saved** at the end (5.5 MB) → next run restores it

```bash
gh pr checks --watch              # live status
gh run list --branch <branch>     # runs
gh run view <id> --log            # full log
```

## Tests in 1 minute

Test = code that calls my code and checks the answer. 3 parts: **prepare → call → assert**.
What to test: **good case · bad input · broken dependency** (fake db that throws).

| Kind | Real DB? | ShopFlow |
|---|---|---|
| unit (fakes) | no | `npm test` |
| integration | yes | Phase 3 step 3 |
| end-to-end | everything | clicking Buy |

Built into Node ≥ 20: `node:test` (run) + `node:assert/strict` (check) → `node --test`. `supertest` (npm) = fake HTTP requests to Express.

### Cache: who can use whose cache?

| Run | Cache |
|---|---|
| PR run 1 | not found → saved (for this PR only) |
| PR run 2 (same PR) | **restored** ✅ |
| push to `main` after merge | not found → saved for `main` |
| new PRs later | can restore **`main`'s** cache ✅ |

Rule: a cache made on a **PR** can only be used by **that PR**. A cache made on **`main`** can be used by **every** branch/PR.
Small project (206 packages) → cache saves only a few seconds; time also changes run to run.
