import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HistoryEntry } from '../src/core/history';
import { DEFAULT_LIMIT, listWorkouts, workoutDetail } from '../src/core/workoutReport';

/** Where the tools get the saved history from; it throws with a message the agent can pass on. */
export type LoadHistory = () => Promise<readonly HistoryEntry[]>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A day as YYYY-MM-DD');
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const FIELDS = `Times are local with their UTC offset. Pace is per 500 m (paceSecPer500 and pacePer500 as m:ss.t), \
watts and strokeRate (strokes per minute) are averages, heartRate is the average in bpm. structure is the \
workout's shape as the monitor shows it, like "2000m", "30:00" or "8x500m/3:30r"; name is the rower's own. \
feeling runs from 1 (weary) to 5 (beaming). Fields the workout does not have are left out.`;

/** The read-only ErgScan tools over the rower's saved workout history. */
export function createMcpServer(loadHistory: LoadHistory, timeZone: string, version = '0.0.0-dev'): McpServer {
  const server = new McpServer({ name: 'ergscan', version }, {
    instructions: 'Workouts the rower saved in ErgScan, read from photos of a Concept2 rowing machine ' +
      `monitor (PM5/PM4). The time zone is ${timeZone}. Use list_workouts to find workouts and get_workout for ` +
      'the splits of one.',
  });

  server.registerTool('list_workouts', {
    title: 'List rowing workouts',
    description: `Saved rowing workouts, newest first, with their totals, feeling and notes. ${FIELDS} \
total counts every workout that matched, also those past the limit.`,
    inputSchema: {
      since: day.optional().describe('First day to include, YYYY-MM-DD in the rower\'s time zone'),
      until: day.optional().describe('Last day to include, YYYY-MM-DD in the rower\'s time zone'),
      limit: z.number().int().min(1).max(500).optional().describe(`Most workouts to return (default ${DEFAULT_LIMIT})`),
    },
    annotations: readOnly,
  }, async (filter) => json(listWorkouts(await loadHistory(), filter, timeZone)));

  server.registerTool('get_workout', {
    title: 'Get a rowing workout',
    description: `One workout with every split or interval in order, rest included (rest: true), and each \
split's highest heart rate when a watch recording was added. ${FIELDS}`,
    inputSchema: {
      id: z.string().describe('The id from list_workouts'),
      heartRateEverySec: z.number().int().min(5).max(600).optional()
        .describe('Also return the watch heart rate averaged over windows of this many seconds'),
    },
    annotations: readOnly,
  }, async ({ id, heartRateEverySec }) => {
    const entry = (await loadHistory()).find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`No workout with id ${id}. Use list_workouts to find one.`);
    return json(workoutDetail(entry, timeZone, heartRateEverySec));
  });

  return server;
}

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
