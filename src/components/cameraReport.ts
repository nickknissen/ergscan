/**
 * TEMPORARY: what this phone's camera lets a web page control, shown over the camera with `?camera-debug` in the
 * address. It decides which camera controls (zoom, lens picker, tap to focus) are worth building. Remove afterwards.
 */
export const cameraDebug = new URLSearchParams(location.search).has('camera-debug');

const CAPABILITIES = [
  'zoom',
  'focusMode',
  'focusDistance',
  'pointsOfInterest',
  'torch',
  'exposureMode',
  'exposureCompensation',
  'width',
  'height',
  'frameRate',
];
const SETTINGS = ['width', 'height', 'zoom', 'focusMode', 'focusDistance', 'exposureMode', 'facingMode'];

function short(value: unknown): string {
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (Array.isArray(value)) return value.length ? value.join('/') : '[]';
  if (value && typeof value === 'object' && 'max' in value) {
    const range = value as { min?: number; max: number; step?: number };
    return `${short(range.min)}–${short(range.max)}${range.step ? ` step ${short(range.step)}` : ''}`;
  }
  return String(value);
}

/** One camera in a few lines: its label, what it can do and what it is set to now. */
function describe(track: MediaStreamTrack): string[] {
  const caps = (typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}) as Record<string, unknown>;
  const settings = track.getSettings() as Record<string, unknown>;
  const can = CAPABILITIES.filter((key) => key in caps).map((key) => `  ${key}: ${short(caps[key])}`);
  const now = SETTINGS.filter((key) => key in settings).map((key) => `${key}=${short(settings[key])}`);
  return [`# ${track.label}`, ...can, `  now: ${now.join(' ')}`];
}

function header(): string[] {
  const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>;
  const no = CAPABILITIES.filter((key) => !supported[key]);
  return [navigator.userAgent, `unsupported constraints: ${no.length ? no.join(' ') : 'none'}`];
}

export function cameraReport(track: MediaStreamTrack): string {
  return [...header(), '', ...describe(track)].join('\n');
}

/**
 * Opens every camera in turn and describes each one. The caller stops its own stream first, since many phones can't
 * open two cameras at once.
 */
export async function reportAllCameras(): Promise<string> {
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const lines = header();
  for (const camera of cameras) {
    lines.push('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: camera.deviceId } } });
      const track = media.getVideoTracks()[0];
      if (track) lines.push(...describe(track));
      media.getTracks().forEach((t) => t.stop());
    } catch (error) {
      lines.push(`# ${camera.label}: ${error instanceof DOMException ? error.name : String(error)}`);
    }
  }
  return lines.join('\n');
}
