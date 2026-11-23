/** The camera's own zoom, as its track reports it. Only real (sensor or lens) zoom: no cropping of the video. */
export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

/** Zoom levels offered as chips, where the camera reaches them. 0.5 only shows on a camera that zooms out. */
const STOPS = [0.5, 1, 2, 4, 8];
const EPSILON = 1e-6;

/** The zoom range from `track.getCapabilities()`, or null where the camera can't zoom. */
export function zoomRange(capabilities: unknown): ZoomRange | null {
  const zoom = (capabilities as { zoom?: Partial<ZoomRange> } | null | undefined)?.zoom;
  if (!zoom || typeof zoom.min !== 'number' || typeof zoom.max !== 'number' || !(zoom.max > zoom.min)) return null;
  const step = typeof zoom.step === 'number' && zoom.step > 0 ? zoom.step : 0.1;
  return { min: zoom.min, max: zoom.max, step };
}

/** `value` kept inside the range and on one of its steps. */
export function clampZoom(value: number, range: ZoomRange): number {
  const inside = Math.min(range.max, Math.max(range.min, value));
  const stepped = range.min + Math.round((inside - range.min) / range.step) * range.step;
  return Math.round(Math.min(range.max, stepped) * 1000) / 1000;
}

/** The chips to show. None when fewer than two fit, since a single chip does nothing. */
export function zoomStops(range: ZoomRange): number[] {
  const stops = STOPS.filter((stop) => stop >= range.min - EPSILON && stop <= range.max + EPSILON);
  return stops.length > 1 ? stops : [];
}

/** The chip that stands for `zoom`: the highest stop at or below it, or the lowest stop. */
export function activeStop(zoom: number, stops: readonly number[]): number | null {
  if (!stops.length) return null;
  return stops.filter((stop) => stop <= zoom + EPSILON).at(-1) ?? stops[0]!;
}

/** The zoom a pinch reaches: the zoom when two fingers went down, scaled by how far they spread since. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number, range: ZoomRange): number {
  if (startDistance <= 0) return clampZoom(startZoom, range);
  return clampZoom(startZoom * (distance / startDistance), range);
}

/**
 * Sends zoom changes to the camera one at a time. A pinch asks for a new zoom on every pointer move, faster than a
 * camera applies them, so while one is applying only the latest request waits; the ones in between are dropped.
 * A camera that refuses a zoom just stays where it was.
 */
export function createZoomApplier(apply: (zoom: number) => Promise<void>): (zoom: number) => void {
  let applying = false;
  let next: number | null = null;

  async function drain() {
    applying = true;
    while (next !== null) {
      const zoom = next;
      next = null;
      try {
        await apply(zoom);
      } catch {
        // Refused or the track ended: keep the zoom the camera has.
      }
    }
    applying = false;
  }

  return (zoom) => {
    next = zoom;
    if (!applying) void drain();
  };
}
