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

  it('rate-limits only the sync routes that create something, by client address', () => {
    const limits = read('./nginx-sync-limits.conf');
    const sync = blocks(read('./nginx-sync.conf'));
    const zones = new Map([...limits.matchAll(/^limit_req_zone (\S+) zone=(\w+):\w+ rate=(\w+\/\w);/gm)]
      .map(([, key, name, rate]) => [name!, { key, rate }]));
    const limited = new Map(sync.flatMap((block) => {
      const zone = / limit_req zone=(\w+) burst=(\d+) nodelay;/.exec(' ' + block.body);
      return zone ? [[block.name, { zone: zone[1]!, burst: Number(zone[2]) }]] : [];
    }));

    expect(limited).toEqual(new Map([
      ['location = /api/sync/vault', { zone: 'ergscan_sync_vault', burst: 2 }],
      ['location = /api/sync/pair', { zone: 'ergscan_sync_access', burst: 10 }],
      ['location = /api/sync/recover', { zone: 'ergscan_sync_access', burst: 10 }],
    ]));
    // nginx has no per-hour rate: one a minute is the slowest it can go.
    expect(zones.get('ergscan_sync_vault')?.rate).toBe('1r/m');
    expect(zones.get('ergscan_sync_access')?.rate).toBe('30r/m');
    // Keyed on a map that is empty for anything but POST, so deleting a vault or reading history never counts.
    const key = /map \$request_method (\$\w+) \{([^}]*)\}/.exec(limits);
    expect(key?.[2]?.replace(/\s+/g, ' ').trim()).toBe('default ""; POST $binary_remote_addr;');
    for (const zone of zones.values()) expect(zone.key).toBe(key?.[1]);
    // Each limited location still reaches the sync server, and refused requests are 429s the client understands.
    for (const name of limited.keys()) expect(sync.find((block) => block.name === name)?.body).toContain('proxy_pass http://sync:8787;');
    expect(sync.find((block) => block.name === 'location ^~ /api/sync/')?.body).toContain('limit_req_status 429;');
  });

  it('trusts X-Forwarded-For only from private proxy networks', () => {
    const limits = read('./nginx-sync-limits.conf');
    expect([...limits.matchAll(/^set_real_ip_from (\S+);/gm)].map((match) => match[1])).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    expect(limits).toMatch(/^real_ip_header X-Forwarded-For;/m);
    expect(limits).toMatch(/^real_ip_recursive on;/m);
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
