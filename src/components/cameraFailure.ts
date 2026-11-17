export type CameraFailureKey = 'camera.denied' | 'camera.missing' | 'camera.busy' | 'camera.failed';

export function cameraFailure(error: unknown): { key: CameraFailureKey; message: string } {
  const name = error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') return { key: 'camera.denied', message };
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { key: 'camera.missing', message };
  if (name === 'NotReadableError') return { key: 'camera.busy', message };
  return { key: 'camera.failed', message };
}
