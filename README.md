# VibeSafe Security Scan — GitHub Action

[![CI](https://github.com/SabahatGhauri/vibesafe-action/actions/workflows/ci.yml/badge.svg)](https://github.com/SabahatGhauri/vibesafe-action/actions/workflows/ci.yml)

Scan your changed code for **exposed secrets, injection flaws, missing RLS, and risky patterns** on every push or pull request. The check fails when critical issues are found; configure branch rules to require that check before merging. Built for teams shipping AI-generated apps.

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

Open a PR and VibeSafe scans the changed files, comments the results, and fails the check on criticals. To enforce a merge block, make the scan job a required status check in your branch rules.

Pull requests from forks do not receive your repository's API secret. They fail with
a missing-key message rather than a clean scan. Do not switch to `pull_request_target`
and execute untrusted PR code with secrets to bypass that restriction.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `api_key` | — (required) | Your `vibesafe_sk_` key. Store as a secret. |
| `fail_on` | `critical` | When to fail the check: `critical`, `warning`, or `never` |
| `comment` | `true` | Post a summary comment on the PR |
| `max_files` | `25` | Max changed files to scan per run |
| `fail_on_incomplete` | `true` | Fail the check when a changed file could not be fully scanned (scan error, file over 100,000 characters, or skipped by `max_files`). A partial scan is not a pass. |

Example — fail on warnings too, and don't comment:

```yaml
      - uses: SabahatGhauri/vibesafe-action@v1
        with:
          api_key: ${{ secrets.VIBESAFE_API_KEY }}
          fail_on: warning
          comment: 'false'
```

## Notes

- The action counts each file scanned. Check [VibeSafe](https://vibesafe.info) for current plans and scan allowances.
- Scanner requests time out after 60 seconds. Invalid responses, unreadable files, and partial scan coverage are incomplete scans.
- Failed GitHub file listings and listings that reach the API/file enumeration limits fail the job because coverage cannot be established. New-branch pushes without an existing base commit also fail explicitly; open a pull request against an existing base to scan those changes.
- Requires `actions/checkout` before the action so it can read your files.
- Supports JS/TS, Python, Java, C#, HTML, CSS, JSON, YAML, SQL, ENV, and Markdown.

## Links
- Website & dashboard: https://vibesafe.info
- VS Code / Cursor extension, MCP server, and more: [vibesafe.info](https://vibesafe.info)
- Support: contact@vibesafe.info

MIT licensed.

## Development

Use Node.js 18.19 or newer. No dependency installation is required.

```sh
node --test test/*.test.mjs
```

Tests execute the scanner with synthetic GitHub events and intercepted HTTP
responses; no credentials or real API calls are needed. CI checks Node 18, 20, 22,
and 24. Report vulnerabilities through [SECURITY.md](SECURITY.md).
