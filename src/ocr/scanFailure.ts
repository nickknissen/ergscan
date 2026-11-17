export function scanFailure(error: unknown, online: boolean): { key: 'scan.offline' | 'scan.error'; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  return { key: online ? 'scan.error' : 'scan.offline', message };
}
