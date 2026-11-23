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
