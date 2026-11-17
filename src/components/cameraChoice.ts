export const CAMERA_KEY = 'ergscan.camera';

const RESOLUTION = { width: { ideal: 2560 }, height: { ideal: 1920 } };

export function videoConstraints(deviceId: string | null): MediaTrackConstraints {
  return deviceId ? { deviceId: { exact: deviceId }, ...RESOLUTION } : { facingMode: { ideal: 'environment' }, ...RESOLUTION };
}

export function videoInputs<T extends { kind: string; deviceId: string }>(devices: readonly T[]): T[] {
  return devices.filter((d) => d.kind === 'videoinput' && d.deviceId !== '');
}

export function nextCamera(cameras: readonly { deviceId: string }[], current: string | null): string | null {
  if (cameras.length < 2) return null;
  const index = cameras.findIndex((c) => c.deviceId === current);
  return cameras[(index + 1) % cameras.length]!.deviceId;
}

export function lostChosenCamera(error: unknown, deviceId: string | null): boolean {
  const name = error instanceof DOMException ? error.name : '';
  return deviceId !== null && (name === 'OverconstrainedError' || name === 'NotFoundError');
}
