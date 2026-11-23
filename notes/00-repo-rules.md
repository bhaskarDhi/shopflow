# 00 · Repo rules (Phase 0)

## Step 1: put the repo on GitHub ✅

```bash
gh repo create shopflow --public --source=. --remote=origin --push
```

| Flag | Meaning |
|---|---|
| `--public` | public repo |
| `--source=.` | use this folder |
| `--remote=origin` | add the GitHub URL as `origin` |
| `--push` | push `main` now |

**Why public:** on a free account, branch protection / rulesets are **not enforced on private repos** (needs GitHub Pro). Public also = unlimited Actions minutes. Safe because `.env`, `*.tfstate` are in `.gitignore`.

Check: `git remote -v`, `gh repo view --json visibility`.

## Step 2: protect `main` with a ruleset ✅

Settings → Rules → Rulesets → New branch ruleset:

| Field | Value | Why |
|---|---|---|
| Name | `protect-main` | |
| Enforcement | Active | rules really on |
| Bypass list | **empty** | otherwise the rules don't apply to me |
| Target | Include default branch | = `main` |
| Restrict deletions | on | nobody deletes `main` |
| Block force pushes | on | nobody rewrites history |
| Require a PR | on, approvals = **0** | I work alone (can't approve my own PR) |
| Require status checks | on, **list empty** for now | add CI job names in Phase 3 |

Test: `git push` on main → **rejected** ✅. Right way:

```bash
git switch -c <type>/<short-name>
git push -u origin <type>/<short-name>
gh pr create --fill
gh pr merge --squash --delete-branch
git switch main && git pull
git fetch --prune        # remove old remote branch names locally
```

Repo settings (squash only + auto-delete branches):

```bash
gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
```

Check: `gh api repos/bhaskarDhi/shopflow/rulesets` · `gh api repos/bhaskarDhi/shopflow --jq '{delete_branch_on_merge, allow_squash_merge}'`

## Step 3: Conventional Commits + CODEOWNERS ✅

### Conventional Commits = `<type>: <description>`

| Type | When | Version bump (Phase 5) |
|---|---|---|
| `feat` | new feature | minor `1.1.0` |
| `fix` | bug fix | patch `1.0.1` |
| `feat!` | breaking change | major `2.0.0` |
| `docs` `chore` `ci` `build` `refactor` `test` | no user change | none |

**Squash merge** = all branch commits → **1 commit** on `main`, message = **PR title**.
→ branch commit messages can be anything; the **PR title** must follow the format.

### `.github/CODEOWNERS` = who reviews which folder

```
*                   @bhaskarDhi
/services/api/      @bhaskarDhi
/services/worker/   @bhaskarDhi
/web/               @bhaskarDhi
```

| Rule | |
|---|---|
| 1 rule per line | `pattern  @owner [@owner2 ...]` |
| last matching line wins | general rules at top, specific at bottom |
| company | `@org/team`; team members are set on the GitHub website (org → Teams), not in the file; the team needs **Write** access |
| team ruleset | approvals 1–2 + "Require review from Code Owners" + "Dismiss stale approvals" |

Validate: `gh api "repos/bhaskarDhi/shopflow/codeowners/errors?ref=<branch>"` → `{"errors":[]}` = OK

**Mistakes I made:** `mkdir .github/CODEOWNERS` made a **folder** (git ignores empty folders → nothing committed; use `touch`). Wrote all patterns on 1 line → `Invalid owner`.

## Step 4: Dependabot ✅

| Part | What | How |
|---|---|---|
| A. Security updates | PR when a package has a known CVE | repo setting (below) |
| B. Version updates | PRs on a schedule for new versions | `.github/dependabot.yml` |

```bash
# A: alerts first, then automatic security PRs
gh api -X PUT repos/bhaskarDhi/shopflow/vulnerability-alerts
gh api -X PUT repos/bhaskarDhi/shopflow/automated-security-fixes
# check: 204 = on, 404 = off
gh api repos/bhaskarDhi/shopflow/vulnerability-alerts -i | sed -n 1p
gh api repos/bhaskarDhi/shopflow/automated-security-fixes      # {"enabled":true}
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directories: ["/services/api", "/services/worker", "/web"]
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore(deps)"          # keeps Conventional Commits; (deps) = scope
    groups:
      npm-minor-patch:
        update-types: ["minor", "patch"]   # small updates → 1 PR; majors → 1 PR each
```

Later: add `docker` (Phase 1) and `github-actions` (Phase 3) items.
**Don't merge Dependabot PRs without CI** (majors like express 4→5 can break the app) → Phase 3 makes CI run on them.
