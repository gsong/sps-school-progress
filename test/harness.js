// Runs an in-page script file unchanged, the way the browser's JavaScript tool does:
// as one evaluated expression in the page, with the page's fetch, location and document.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

const SCRIPTS = join(import.meta.dirname, '../plugins/sps-school-progress/skills/check/scripts');

export async function runScript(file, { url, title, body = '', routes = [], now }) {
  const code = readFileSync(join(SCRIPTS, file), 'utf8');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  window.happyDOM.setURL(url);
  document.title = title;
  document.body.innerHTML = body;
  const calls = [];
  globalThis.fetch = async (path, init = {}) => {
    calls.push({ path, init });
    const route = routes.find((r) => (typeof r.match === 'string' ? path.startsWith(r.match) : r.match(path, init)));
    if (!route) throw new Error(`no stub for ${path}`);
    return route.respond(path, init);
  };
  try {
    const text = await (0, eval)(code);
    return { result: JSON.parse(text), text, calls };
  } finally {
    vi.useRealTimers();
  }
}

// A fetch Response with only the parts the scripts read.
export function reply(body, { status = 200, redirected = false, url = 'https://example.test/', type } = {}) {
  const isText = typeof body === 'string';
  const contentType = type || (isText ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8');
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    url,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => (isText ? body : JSON.stringify(body)),
    json: async () => (isText ? JSON.parse(body) : body),
  };
}
