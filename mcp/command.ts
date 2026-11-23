import { fileURLToPath } from 'node:url';

/** Set by the npm build (scripts/build-mcp.mjs); undefined when running from a checkout through tsx. */
declare const __ERGSCAN_MCP__: { name: string; version: string } | undefined;

const published = typeof __ERGSCAN_MCP__ === 'undefined' ? null : __ERGSCAN_MCP__;

export const VERSION = published?.version ?? '0.0.0-dev';

/** How the user runs this tool, for the commands it prints. */
export const COMMAND = published
  ? `npx -y ${published.name}`
  : `node ${fileURLToPath(new URL('./ergscan-mcp.mjs', import.meta.url))}`;
