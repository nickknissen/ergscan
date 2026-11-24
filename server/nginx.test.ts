import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SECURITY_HEADERS = 'include /etc/nginx/snippets/ergscan-headers.conf;';

/** Each block's own directives (nested blocks left out), keyed by the text before its `{`. */
function blocks(config: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const open: { name: string; body: string }[] = [];
  let text = '';
  for (const character of config.replace(/#.*$/gm, '')) {
    if (character === '{') {
      open.push({ name: text.trim().split(/[;}]/).at(-1)!.trim(), body: '' });
      text = '';
    } else if (character === '}') {
      const block = open.pop()!;
      block.body += text;
      found.push(block);
      text = '';
    } else {
      text += character;
      if (character === ';' && open.length) {
        open.at(-1)!.body += text;
        text = '';
      }
    }
  }
  return found;
}

describe('web nginx config', () => {
  // nginx drops every add_header inherited from the server block in a location that sets its own.
  it('sends the security headers from the server and every location that sets headers', () => {
    const config = blocks(read('../nginx.conf'));
    const server = config.find((block) => block.name === 'server');
    expect(server?.body).toContain(SECURITY_HEADERS);
    // The sync image includes nginx-sync.conf inside the same server block.
    const missing = [...config, ...blocks(read('./nginx-sync.conf'))]
      .filter((block) => block.body.includes('add_header') && !block.body.includes(SECURITY_HEADERS))
      .map((block) => block.name);
    expect(missing).toEqual([]);
  });

  it('allows no inline scripts, inline styles or eval, only the WASM compile OCR needs', () => {
    const policy = /add_header Content-Security-Policy "([^"]+)" always;/.exec(read('../nginx-headers.conf'))?.[1];
    const directives = new Map(policy?.split(';').map((part) => {
      const [name = '', ...sources] = part.trim().split(/\s+/);
      return [name, sources] as const;
    }));
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(directives.get('style-src')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*/);
  });
});
