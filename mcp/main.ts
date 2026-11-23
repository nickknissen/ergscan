import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import QRCode from 'qrcode';
import { parseArgs } from 'node:util';
import { revokeDevice, SyncError } from '../src/sync/client';
import { COMMAND, VERSION } from './command';
import {
  approvalUrl, devicePath, forgetLinked, historyLoader, link, readLinked, saveLinked, serverOrigin,
} from './local';
import { createMcpServer, type LoadHistory } from './server';

const USAGE = `ErgScan MCP server ${VERSION}: lets an agent read your synced ErgScan workouts.
The history is decrypted on this computer; the sync server only ever sees it encrypted.

Usage:
  ${COMMAND} link --server <https://your-ergscan>
      Link this computer to your synced history
  ${COMMAND} unlink
      Remove this computer from your linked devices
  ${COMMAND}
      Run the MCP server over stdio (for the agent)

The device file is ${devicePath()}
(set ERGSCAN_MCP_DEVICE to keep it elsewhere).`;

async function linkCommand(args: string[]) {
  const { values } = parseArgs({ args, options: { server: { type: 'string' } } });
  const path = devicePath();
  const existing = await readLinked(path);
  if (existing) {
    console.log(`Already linked to ${existing.server}. Run \`${COMMAND} unlink\` first to link again.`);
    return;
  }
  if (!values.server) throw new Error(`Pass the address of your ErgScan deployment: ${COMMAND} link --server https://…`);
  const server = serverOrigin(values.server);

  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  const device = await link(server, {
    signal: controller.signal,
    onInvite: async (invite) => {
      const url = approvalUrl(server, invite);
      console.log('On a device that already syncs, scan this code with the camera, or open ErgScan →');
      console.log('Settings → Private sync and paste the link below. Then choose Approve new device.\n');
      console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
      console.log(url + '\n');
      console.log(`Waiting for approval until ${new Date(invite.expires).toLocaleTimeString()}… (Ctrl+C to cancel)`);
    },
  }).catch((error: unknown) => {
    if (controller.signal.aborted) throw new Error('Cancelled.');
    throw error;
  });
  const linked = { server, device };
  await saveLinked(path, linked);
  const workouts = await historyLoader(linked)();
  const count = workouts.length === 1 ? '1 workout' : `${workouts.length} workouts`;
  console.log(`\nLinked. ${count} in your history. The key is saved in ${path}.`);
  console.log('Add the server to your agent, for example in Claude Code:');
  console.log(`  claude mcp add ergscan -- ${COMMAND}`);
}

async function unlinkCommand() {
  const path = devicePath();
  const linked = await readLinked(path);
  if (!linked) {
    console.log('This computer is not linked.');
    return;
  }
  const { server, device } = linked;
  try {
    await revokeDevice(device, device.id, server);
  } catch (error) {
    // Already removed from another device, or the whole history was deleted.
    if (!(error instanceof SyncError && error.status === 401)) throw error;
  }
  await forgetLinked(path);
  console.log(`Unlinked from ${server} and deleted ${path}.`);
}

async function serve() {
  const linked = await readLinked(devicePath());
  const load: LoadHistory = linked ? historyLoader(linked) : () => Promise.reject(new Error(
    `ErgScan is not linked on this computer yet. Run \`${COMMAND} link --server https://…\` in a terminal first.`,
  ));
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await createMcpServer(load, timeZone, VERSION).connect(new StdioServerTransport());
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'link') await linkCommand(args);
  else if (command === 'unlink') await unlinkCommand();
  else if (command === undefined) await serve();
  else {
    console.log(USAGE);
    if (command !== 'help' && command !== '--help' && command !== '-h') process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
