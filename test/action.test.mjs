import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(t, scenario = {}, args = [], extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibesafe-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify(scenario));
  fs.writeFileSync(path.join(dir, 'event.json'), JSON.stringify(scenario.event || { pull_request: { number: 1 } }));
  for (const [name, content] of Object.entries(scenario.contents || { 'app.js': 'const value = 1;' })) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  const env = { ...process.env, NODE_OPTIONS: '', VIBESAFE_API_BASE: '',
    VIBESAFE_TEST_SCENARIO: path.join(dir, 'scenario.json'),
    VIBESAFE_API_KEY: 'vibesafe_sk_test_only', INPUT_API_KEY: 'vibesafe_sk_test_only',
    INPUT_FAIL_ON: 'critical', INPUT_MAX_FILES: '25', INPUT_FAIL_ON_INCOMPLETE: 'true',
    INPUT_COMMENT: 'false', GH_TOKEN: '', GITHUB_REPOSITORY: 'example/repo',
    GITHUB_EVENT_PATH: path.join(dir, 'event.json'), GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
    ...extraEnv };
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(root, 'test/mock-fetch.mjs')).href, path.join(root, ENTRY), ...args],
    { cwd: dir, env, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  result.summary = fs.existsSync(env.GITHUB_STEP_SUMMARY) ? fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8') : '';
  return result;
}

const ENTRY = 'scan.mjs';
test('clean scan passes and writes summary', t => {
  const r = run(t); assert.equal(r.status, 0, r.stderr); assert.match(r.summary, /No security issues found/);
});
for (const [name, scenario] of Object.entries({
  unauthorized: { status: 401, body: { error: 'invalid key' } },
  malformed: { raw: '<html>error</html>' }, missingFields: { body: {} },
  invalidIssue: { body: { score: 100, issues: [null] } }, timeout: { networkError: 'TimeoutError' },
  partial: { body: { score: 100, issues: [], coverage: { truncated: true } } },
  unreadable: { contents: {} }, oversized: { contents: { 'app.js': 'x'.repeat(100001) } }
})) test(name + ' cannot pass as clean', t => {
  const r = run(t, scenario); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.summary, /Scan incomplete/);
});
test('GitHub listing failure cannot pass as no changes', t => {
  const r = run(t, { githubStatus: 403 }); assert.equal(r.status, 1); assert.match(r.stderr, /Cannot list/);
});
test('GitHub comparison failure cannot pass as no changes', t => {
  const r = run(t, { githubStatus: 503, event: { before: 'abc', after: 'def' } });
  assert.equal(r.status, 1); assert.match(r.stderr, /Cannot compare/);
});
test('new-branch push with unknown base fails explicitly', t => {
  const r = run(t, { event: { before: '000000', after: 'abc' } }); assert.equal(r.status, 1); assert.match(r.stderr, /Cannot determine/);
});
test('PR pagination cap cannot silently truncate coverage', t => {
  const r = run(t, { files: Array.from({ length: 100 }, (_, i) => ({ filename: i + '.js' })) });
  assert.equal(r.status, 1); assert.match(r.stderr, /500-file limit/);
});
test('push comparison cap cannot silently truncate coverage', t => {
  const r = run(t, { event: { before: 'abc', after: 'def' }, files: Array.from({ length: 300 }, (_, i) => ({ filename: i + '.js' })) });
  assert.equal(r.status, 1); assert.match(r.stderr, /file limit/);
});
test('critical finding fails', t => {
  const r = run(t, { body: { score: 10, issues: [{ severity: 'critical', title: 'Secret' }] } });
  assert.equal(r.status, 1); assert.match(r.summary, /Secret/);
});
test('explicit incomplete override stays visibly incomplete', t => {
  const r = run(t, { status: 503 }, [], { INPUT_FAIL_ON_INCOMPLETE: 'false' });
  assert.equal(r.status, 0); assert.match(r.summary, /Scan incomplete/);
});
test('max_files overflow fails', t => {
  const r = run(t, { files: [{ filename: 'app.js' }, { filename: 'other.js' }] }, [], { INPUT_MAX_FILES: '1' });
  assert.equal(r.status, 1); assert.match(r.summary, /skipped/);
});
test('removed files do not trigger scanning', t => {
  const r = run(t, { files: [{ filename: 'app.js', status: 'removed' }] });
  assert.equal(r.status, 0); assert.match(r.stdout, /no scannable files/);
});
for (const env of [{ INPUT_MAX_FILES: '0' }, { INPUT_MAX_FILES: '1x' }, { INPUT_FAIL_ON: 'typo' }, { INPUT_API_KEY: '' }, { INPUT_FAIL_ON_INCOMPLETE: 'flase' }]) {
  test('rejects invalid configuration ' + JSON.stringify(env), t => assert.equal(run(t, {}, [], env).status, 1));
}
