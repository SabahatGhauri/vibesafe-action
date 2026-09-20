// Preloaded only by tests. Every fetch is intercepted; no remote requests are made.
import fs from 'node:fs';
const scenario = JSON.parse(fs.readFileSync(process.env.VIBESAFE_TEST_SCENARIO, 'utf8'));
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.github.com/')) {
    if (scenario.githubStatus) return new Response('{}', { status: scenario.githubStatus });
    if (u.includes('/comments')) return new Response('[]');
    const files = scenario.files || [{ filename: 'app.js', status: 'modified' }];
    return Response.json(u.includes('/compare/') ? { files } : files);
  }
  if (!u.startsWith('https://vibesafe-api.vercel.app/')) throw new Error('Unexpected network request: ' + u);
  if (!options.signal) throw new Error('Scanner request has no timeout signal');
  if (scenario.expectedLanguage && JSON.parse(options.body).language !== scenario.expectedLanguage) throw new Error('Wrong language');
  if (scenario.networkError) throw new Error(scenario.networkError);
  if (scenario.raw !== undefined) return new Response(scenario.raw, { status: scenario.status || 200 });
  return Response.json(scenario.body ?? { score: 100, issues: [] }, { status: scenario.status || 200 });
};
