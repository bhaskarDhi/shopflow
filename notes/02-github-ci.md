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

## Step 2a: worker + web jobs ✅

3 jobs run **at the same time**, each on its **own** fresh computer (so each needs checkout + setup-node).

| | api | worker | web |
|---|---|---|---|
| folder + lock file | `services/api` | `services/worker` | `web` |
| checks | lint + test | lint + test | **build** (no lint/test scripts) |

**Mistake I made:** web's `npm run build` ended up in the worker job, and no web job → `npm error Missing script: "build"` → CI red ❌ **before** merge = CI did its job.

## What is lint?

**Lint = a robot that reads my code (without running it) and finds mistakes + bad style.**
Tool: **ESLint** (`npm run lint` → `eslint .`). Rules: `eslint.config.js` → `js.configs.recommended` + Node globals.

| Code | ESLint says | Rule |
|---|---|---|
| `const x = 5;` (never used) | `'x' is assigned a value but never used` | `no-unused-vars` |
| `consle.log('hi')` (typo) | `'consle' is not defined` | `no-undef` |
| `if (a = 5)` | assignment in a condition, probably meant `===` | `no-cond-assign` |
| `return 1; console.log('x')` | code after return never runs | `no-unreachable` |

| | lint | test |
|---|---|---|
| runs the code? | ❌ only **reads** it | ✅ runs it |
| finds | typos, unused things, risky patterns | wrong **behaviour** (wrong answer, wrong status) |

Real example in `app.js`: `// eslint-disable-next-line no-unused-vars` above the Express error handler — `next` must be there (Express needs 4 arguments) but is not used → tell ESLint "I know, skip this line".

Try: add `const unused = 1;` in `src/app.js` → `npm run lint` → error with **file:line:column** → remove it.

## How to read the log when CI fails

| Way | Command / place |
|---|---|
| status of the PR | `gh pr checks` (or `gh pr checks --watch`) |
| **only the failed step** (fastest) | `gh run view --log-failed` |
| a specific run | `gh run list` → `gh run view <id> --log-failed` |
| everything | `gh run view <id> --log` |
| in the browser | PR → **Checks** tab (or "Details" next to the ❌) → click the red step |
| rerun (e.g. GitHub had a hiccup) | `gh run rerun <id> --failed` |

Read from the **bottom up**: the last lines say `##[error]Process completed with exit code 1`; the real reason is a few lines **above** (e.g. `npm error Missing script: "build"`, or ESLint `file:line:col  error  ...`, or a test `✖ ... expected 201, actual 400`).

Then: fix locally → run the same command on my Mac (`npm run lint` / `npm test` / `npm run build`) → green → push to the **same** PR → CI runs again.

## Step 2b: path filters ✅

Goal: run only the job for the folder that changed.

| Way | Problem |
|---|---|
| ❌ `on: pull_request: paths: [...]` (top of workflow) | PR without matching files → workflow **never starts** → required check never arrives → PR **stuck forever** ("Expected — waiting for status") |
| ✅ a `changes` job + `if:` on each job | workflow **always** starts; jobs **skip** themselves; **skipped = OK** for required checks |

```yaml
permissions:
  contents: read
  pull-requests: read            # paths-filter reads the PR's file list (needed in private repos)
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:                     # answers for other jobs
      api: ${{ steps.filter.outputs.api }}
      worker: ${{ steps.filter.outputs.worker }}
      web: ${{ steps.filter.outputs.web }}
    steps:
      - uses: actions/checkout@v5
      - uses: dorny/paths-filter@v3
        id: filter               # name, so steps.filter.outputs.X works
        with:
          filters: |
            api:
              - 'services/api/**'          # ** = everything inside, any depth
              - '.github/workflows/ci.yml' # CI changed → test everything
            worker: [...]
            web: [...]
  api:
    needs: changes                                  # wait for the decider
    if: needs.changes.outputs.api == 'true'         # run only if api changed
```

Result (test PR #30, only `web/index.html` changed): `changes ✓  web ✓  api ⏭ skipping  worker ⏭ skipping`

**Mistakes I made (and merged, because no check was required yet!):**
- `need.changes` → workflow file broken → run failed before any job (#26)
- `.gihub/workflows/ci.yml` → path never matched → CI changes **tested nothing** but showed ✅ (#27, #28). A green check that tested nothing = dangerous.
- fixed the typo locally but **never pushed** → GitHub doesn't see it.

### Git / shell lessons

| Problem | Fix |
|---|---|
| after a squash merge: `main...origin/main [ahead 1, behind 1]` | `git switch main && git fetch --prune && git reset --hard origin/main` |
| `zsh: event not found` with `!` in `"..."` | use **single quotes** `'...'` (no `!` / `$` changes) |
