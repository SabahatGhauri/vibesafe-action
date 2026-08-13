// VibeSafe GitHub Action — scans changed files with the VibeSafe API, posts a
// summary comment on the PR, and fails the check on critical issues.
// Dependency-free: uses Node 20 global fetch + fs. No build step.

import fs from 'node:fs';

const API = 'https://vibesafe-api.vercel.app/api/scan';
const GH = 'https://api.github.com';

const API_KEY   = process.env.INPUT_API_KEY || '';
const FAIL_ON   = (process.env.INPUT_FAIL_ON || 'critical').toLowerCase();
const COMMENT   = (process.env.INPUT_COMMENT || 'true') === 'true';
const MAX_FILES = parseInt(process.env.INPUT_MAX_FILES || '25', 10);
const GH_TOKEN  = process.env.GH_TOKEN || '';

const EXT_LANG = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', java: 'Java', cs: '.NET / C#',
  html: 'HTML', htm: 'HTML', css: 'CSS', json: 'JSON', jsonc: 'JSON',
  env: 'Environment file', md: 'Markdown', markdown: 'Markdown',
  yml: 'YAML', yaml: 'YAML', sql: 'SQL',
};

// `path.split('.').pop()` only catches bare `.env` — for `.env.local`,
// `.env.production`, etc. it returns "local"/"production", which isn't in
// EXT_LANG, so those files were silently skipped even though they're exactly
// the kind of file this scanner exists to catch. Match by basename first.
function detectLanguage(filePath) {
  const base = (filePath.split(/[\\/]/).pop() || '');
  if (/^\.env(\..+)?$/i.test(base)) return 'Environment file';
  const ext = (base.split('.').pop() || '').toLowerCase();
  return EXT_LANG[ext] || null;
}

function fail(msg) { console.error('❌ ' + msg); process.exit(1); }
function log(msg) { console.log(msg); }

function ghHeaders() {
  return { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'vibesafe-action' };
}

async function getChangedFiles(ev, repo) {
  // Pull request → the PR files API (most reliable)
  if (ev.pull_request) {
    const num = ev.pull_request.number;
    const files = [];
    for (let page = 1; page <= 5; page++) {
      const r = await fetch(`${GH}/repos/${repo}/pulls/${num}/files?per_page=100&page=${page}`, { headers: ghHeaders() });
      if (!r.ok) break;
      const batch = await r.json();
      files.push(...batch);
      if (batch.length < 100) break;
    }
    return files.filter(f => f.status !== 'removed').map(f => f.filename);
  }
  // Push → compare before...after
  if (ev.before && ev.after && !/^0+$/.test(ev.before)) {
    const r = await fetch(`${GH}/repos/${repo}/compare/${ev.before}...${ev.after}`, { headers: ghHeaders() });
    if (r.ok) {
      const d = await r.json();
      return (d.files || []).filter(f => f.status !== 'removed').map(f => f.filename);
    }
  }
  return [];
}

async function scanFile(path, language) {
  let code;
  try { code = fs.readFileSync(path, 'utf8'); } catch { return null; }
  if (!code || code.length < 5 || code.length > 100000) return null;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ code, language, source: 'github_action' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { path, error: data.error || `scan failed (${r.status})` };
    return { path, score: data.score, issues: data.issues || [] };
  } catch (e) {
    return { path, error: e.message };
  }
}

async function postComment(repo, num, body) {
  if (!COMMENT || !GH_TOKEN || !num) return;
  try {
    // Update our previous comment if present (keeps the PR tidy).
    const marker = '<!-- vibesafe-scan -->';
    const list = await fetch(`${GH}/repos/${repo}/issues/${num}/comments?per_page=100`, { headers: ghHeaders() });
    const existing = list.ok ? (await list.json()).find(c => (c.body || '').includes(marker)) : null;
    const payload = JSON.stringify({ body: marker + '\n' + body });
    if (existing) {
      await fetch(`${GH}/repos/${repo}/issues/comments/${existing.id}`, { method: 'PATCH', headers: ghHeaders(), body: payload });
    } else {
      await fetch(`${GH}/repos/${repo}/issues/${num}/comments`, { method: 'POST', headers: ghHeaders(), body: payload });
    }
  } catch (e) { log('Could not post PR comment: ' + e.message); }
}

async function main() {
  if (!API_KEY.startsWith('vibesafe_sk_')) {
    fail('Missing or invalid VibeSafe API key. Add a repo secret and pass it as `api_key`. Get one free at https://vibesafe.info → API keys.');
  }
  const evPath = process.env.GITHUB_EVENT_PATH;
  const ev = evPath && fs.existsSync(evPath) ? JSON.parse(fs.readFileSync(evPath, 'utf8')) : {};
  const repo = process.env.GITHUB_REPOSITORY || (ev.repository && ev.repository.full_name);
  const prNum = ev.pull_request ? ev.pull_request.number : null;

  let changed = await getChangedFiles(ev, repo);
  changed = changed.filter(f => detectLanguage(f));
  if (changed.length === 0) { log('✅ VibeSafe: no scannable files changed.'); return; }
  const scanned = changed.slice(0, MAX_FILES);
  log(`VibeSafe: scanning ${scanned.length} changed file(s)…`);

  const results = [];
  for (const f of scanned) {
    const lang = detectLanguage(f);
    const res = await scanFile(f, lang);
    if (res) results.push(res);
  }

  let crit = 0, warn = 0, info = 0;
  const rows = [];
  for (const r of results) {
    if (r.error) { rows.push(`| \`${r.path}\` | ⚠️ ${r.error} |`); continue; }
    const c = r.issues.filter(i => i.severity === 'critical').length;
    const w = r.issues.filter(i => i.severity === 'warning').length;
    const n = r.issues.filter(i => i.severity === 'info').length;
    crit += c; warn += w; info += n;
    const badge = c ? `🔴 ${c} critical` : w ? `🟡 ${w} warning` : n ? `🔵 ${n} info` : '✅ clean';
    rows.push(`| \`${r.path}\` | ${r.score ?? '—'}/100 — ${badge} |`);
  }

  const verdict = crit ? '🔴 Critical issues found' : warn ? '🟡 Warnings found' : '✅ No security issues found';
  let body = `## 🛡️ VibeSafe Security Scan\n\n**${verdict}** — ${crit} critical · ${warn} warnings · ${info} info across ${results.length} file(s).\n\n`;
  body += `| File | Result |\n|------|--------|\n${rows.join('\n')}\n\n`;
  if (crit) {
    body += `\n### Critical issues\n`;
    for (const r of results.filter(x => !x.error)) {
      for (const i of r.issues.filter(x => x.severity === 'critical')) {
        body += `- **${i.title}** in \`${r.path}\`${i.line ? ' (' + i.line + ')' : ''}\n  ${i.description || ''}\n`;
        if (i.after) body += `  _Fix:_ \`${i.after}\`\n`;
      }
    }
  }
  body += `\n<sub>Scanned by [VibeSafe](https://vibesafe.info). Your code is never stored.</sub>`;

  // Job summary + PR comment
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n');
  await postComment(repo, prNum, body);

  log(`VibeSafe: ${crit} critical, ${warn} warnings, ${info} info.`);
  const shouldFail =
    (FAIL_ON === 'critical' && crit > 0) ||
    (FAIL_ON === 'warning' && (crit > 0 || warn > 0));
  if (shouldFail) fail(`VibeSafe found ${crit} critical / ${warn} warning issue(s). Fix them before merging (fail_on: ${FAIL_ON}).`);
  log('✅ VibeSafe check passed.');
}

main().catch(e => fail('VibeSafe action error: ' + e.message));
