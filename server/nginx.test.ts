import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SECURITY_HEADERS = 'include /etc/nginx/snippets/ergscan-headers.conf;';

/** An nginx block: the text before its `{`, and its own directives with nested blocks left out. */
type Block = { name: string; body: string };

/** Every block in an nginx config. Quotes are respected; `#` starts a comment outside them. */
function blocks(config: string): Block[] {
  const found: Block[] = [];
  const open: Block[] = [];
  let text = '';
  let quote: string | null = null;
  let comment = false;
  for (const character of config) {
    if (comment) {
      comment = character !== '\n';
    } else if (quote) {
      text += character;
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      text += character;
      quote = character;
    } else if (character === '#') {
      comment = true;
    } else if (character === '{') {
      open.push({ name: text.trim().split(/[;}]/).at(-1)!.trim().replace(/\s+/g, ' '), body: '' });
      text = '';
    } else if (character === '}') {
      const block = open.pop();
      if (!block) throw new Error('Unbalanced } in nginx config');
      found.push({ ...block, body: (block.body + text).replace(/\s+/g, ' ') });
      text = '';
    } else {
      text += character;
      if (character === ';' && open.length) {
        open.at(-1)!.body += text;
        text = '';
      }
    }
  }
  if (open.length || quote) throw new Error('Unclosed block or quote in nginx config');
  return found;
}

describe('web nginx config', () => {
  // nginx drops every add_header inherited from the server block in a location that sets its own.
  it('sends the security headers from the server and every block that sets headers', () => {
    const config = blocks(read('../nginx.conf'));
    expect(config.find((block) => block.name === 'server')?.body).toContain(SECURITY_HEADERS);
    // The sync image includes nginx-sync.conf inside the same server block.
    const missing = [...config, ...blocks(read('./nginx-sync.conf'))]
      .filter((block) => / add_header /.test(' ' + block.body) && !block.body.includes(SECURITY_HEADERS))
      .map((block) => block.name);
    expect(missing).toEqual([]);
  });

  it('allows no inline scripts, inline styles or eval, only the WASM compile OCR needs', () => {
    const policy = /add_header Content-Security-Policy "([^"]+)" always;/.exec(read('../nginx-headers.conf'))?.[1];
    expect(policy, 'no Content-Security-Policy in nginx-headers.conf').toBeDefined();
    const directives = new Map(policy!.split(';').map((part) => {
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
