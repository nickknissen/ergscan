#!/usr/bin/env node
// Runs the TypeScript entry point through tsx, so the MCP server works from a checkout without a build.
import { register } from 'tsx/esm/api';

register();
await import('./main.ts');
