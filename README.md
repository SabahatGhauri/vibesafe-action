# VibeSafe Security Scan — GitHub Action

Scan your changed code for **exposed secrets, injection flaws, missing RLS, and risky patterns** on every push or pull request — and **block the merge** when critical issues are found. Built for teams shipping AI-generated apps.

Powered by [VibeSafe](https://vibesafe.info). Your code is never stored.

## What it does

- Runs on `pull_request` (or `push`) and scans the files that changed
- Posts a **security summary comment** on the PR with a score per file
- **Fails the check** if critical issues are found (configurable)
- Detects: exposed API keys, SQL injection, XSS, missing auth checks, unsafe config, and more

## Quick start

1. **Get a free API key** at [vibesafe.info](https://vibesafe.info) → **API keys** → Generate. It starts with `vibesafe_sk_`.
2. **Add it as a repo secret**: your repo → Settings → Secrets and variables → Actions → New secret → name it `VIBESAFE_API_KEY`.
3. **Add this workflow** at `.github/workflows/vibesafe.yml`:

```yaml
name: VibeSafe Security Scan
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write   # lets it comment on PRs

jobs:
  vibesafe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: SabahatGhauri/vibesafe-action@v1
        with:
          api_key: ${{ secrets.VIBESAFE_API_KEY }}
```

That's it. Open a PR and VibeSafe scans the diff, comments the results, and fails the check on criticals.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `api_key` | — (required) | Your `vibesafe_sk_` key. Store as a secret. |
| `fail_on` | `critical` | When to fail the check: `critical`, `warning`, or `never` |
| `comment` | `true` | Post a summary comment on the PR |
| `max_files` | `25` | Max changed files to scan per run |

Example — fail on warnings too, and don't comment:

```yaml
      - uses: SabahatGhauri/vibesafe-action@v1
        with:
          api_key: ${{ secrets.VIBESAFE_API_KEY }}
          fail_on: warning
          comment: 'false'
```

## Notes

- The free plan includes 3 scans/month; the action counts each file scanned. For CI use, VibeSafe **Pro/Team** offers unlimited scans.
- Requires `actions/checkout` before the action so it can read your files.
- Supports JS/TS, Python, Java, C#, HTML, CSS, JSON, YAML, SQL, ENV, and Markdown.

## Links
- Website & dashboard: https://vibesafe.info
- VS Code / Cursor extension, MCP server, and more: [vibesafe.info](https://vibesafe.info)
- Support: contact@vibesafe.info

MIT licensed.
