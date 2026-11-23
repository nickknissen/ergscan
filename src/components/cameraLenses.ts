/**
 * Which cameras the phone has, found by opening each one once, so the camera screen can open the best back camera
 * and switch only between back cameras.
 *
 * An iPhone lists every lens and every combination of them as its own camera, with names in the phone's language.
 * The combined ones (the triple and dual wide cameras) are what the native Camera app uses: they switch lens by
 * themselves as you zoom, down to 0.5× and to macro up close. They are the back cameras that zoom below 1×.
 * Android names its cameras "camera 0, facing back" and so on, and none so far zooms below 1×.
 */

export const LENSES_KEY = 'ergscan.cameraLenses';

/** One camera as found when opened. `key` is its label, which stays the same between visits where ids may not. */
export interface CameraLens {
  key: string;
  facing: 'user' | 'environment' | null;
  zoomMin: number | null;
}

interface Device {
  deviceId: string;
  label: string;
}

export function lensKey(device: Device): string {
  return device.label || device.deviceId;
}

/** The phone's cameras as one string: a new or renamed camera means looking at them all again. */
export function lensSignature(devices: readonly Device[]): string {
  return devices.map(lensKey).sort().join('\n');
}

/** A camera that covers every back lens by itself, so zoom chips switch lenses and no switch button is needed. */
export function coversAllLenses(zoomMin: number | null | undefined): boolean {
  return typeof zoomMin === 'number' && zoomMin < 1;
}

/** The back camera to open: the first that covers every lens, or null to let the browser pick its back camera. */
export function preferredCamera<T extends Device>(devices: readonly T[], lenses: readonly CameraLens[]): T | null {
  return (
    devices.find((device) => {
      const lens = lenses.find((l) => l.key === lensKey(device));
      return lens?.facing !== 'user' && coversAllLenses(lens?.zoomMin);
    }) ?? null
  );
}

/** The cameras worth switching between: all but the selfie cameras. A camera not looked at yet stays in. */
export function backCameras<T extends Device>(devices: readonly T[], lenses: readonly CameraLens[]): T[] {
  return devices.filter((device) => lenses.find((l) => l.key === lensKey(device))?.facing !== 'user');
}

export function loadLenses(storage: Pick<Storage, 'getItem'> | null, signature: string): CameraLens[] | null {
  try {
    const saved = JSON.parse(storage?.getItem(LENSES_KEY) ?? 'null') as { signature?: string; lenses?: CameraLens[] } | null;
    return saved?.signature === signature && Array.isArray(saved.lenses) ? saved.lenses : null;
  } catch {
    return null;
  }
}

export function saveLenses(storage: Pick<Storage, 'setItem'>, signature: string, lenses: CameraLens[]): void {
  try {
    storage.setItem(LENSES_KEY, JSON.stringify({ signature, lenses }));
  } catch {
    // Storage full or blocked: the cameras are looked at again next time.
  }
}

/** The facing a device reports before it is opened, where the browser tells (Chrome); null where it doesn't. */
function facingBeforeOpening(device: Device): CameraLens['facing'] {
  const capabilities = (device as { getCapabilities?: () => { facingMode?: string[] } }).getCapabilities?.();
  const facing = capabilities?.facingMode?.[0];
  return facing === 'user' || facing === 'environment' ? facing : null;
}

/**
 * Opens each camera in turn and notes which way it faces and how far it zooms out. A selfie camera the browser
 * already names as one isn't opened. Returns null when `cancelled()` turns true between cameras, as when the camera
 * screen closes; the caller must have stopped its own stream, since many phones can't open two cameras at once.
 */
export async function findLenses(
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>,
  devices: readonly Device[],
  cancelled: () => boolean,
): Promise<CameraLens[] | null> {
  const lenses: CameraLens[] = [];
  for (const device of devices) {
    if (cancelled()) return null;
    const key = lensKey(device);
    if (facingBeforeOpening(device) === 'user') {
      lenses.push({ key, facing: 'user', zoomMin: null });
      continue;
    }
    try {
      const media = await mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: device.deviceId } } });
      const track = media.getVideoTracks()[0];
      const settings = (track?.getSettings() ?? {}) as { facingMode?: string };
      const capabilities = (typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {}) as { zoom?: { min?: number } };
      media.getTracks().forEach((t) => t.stop());
      const facing = settings.facingMode === 'user' || settings.facingMode === 'environment' ? settings.facingMode : null;
      lenses.push({ key, facing, zoomMin: typeof capabilities.zoom?.min === 'number' ? capabilities.zoom.min : null });
    } catch {
      // Busy or refused: keep it as unknown, so it stays switchable and is never preferred.
      lenses.push({ key, facing: null, zoomMin: null });
    }
  }
  return cancelled() ? null : lenses;
}
