/**
 * TEMPORARY: what this phone's camera lets a web page control, shown over the camera with `?camera-debug` in the
 * address. It decides which camera controls (zoom, lens picker, tap to focus) are worth building. Remove afterwards.
 */
export const cameraDebug = new URLSearchParams(location.search).has('camera-debug');

const INTERESTING = ['zoom', 'focusMode', 'focusDistance', 'pointsOfInterest', 'torch', 'exposureMode', 'exposureCompensation', 'whiteBalanceMode'];

export async function cameraReport(track: MediaStreamTrack): Promise<string> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === 'videoinput');
  const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>;
  const capabilities = typeof track.getCapabilities === 'function' ? (track.getCapabilities() as Record<string, unknown>) : null;
  const settings = track.getSettings() as Record<string, unknown>;
  const current = settings.deviceId;

  return [
    navigator.userAgent,
    '',
    `Cameras (${cameras.length}):`,
    ...cameras.map((c) => `${c.deviceId === current ? '▶' : ' '} ${c.label || '(no label)'}`),
    '',
    `Track: ${track.label}`,
    `Supported: ${INTERESTING.map((k) => `${k}=${supported[k] ? 'y' : 'n'}`).join(' ')}`,
    '',
    'Capabilities:',
    capabilities ? JSON.stringify(capabilities, null, 1) : '(getCapabilities missing)',
    '',
    'Settings:',
    JSON.stringify(settings, null, 1),
  ].join('\n');
}
