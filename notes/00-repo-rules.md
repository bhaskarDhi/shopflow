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
