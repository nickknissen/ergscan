import { describe, expect, it, vi } from 'vitest';
import { activeStop, clampZoom, createZoomApplier, pinchZoom, zoomRange, zoomStops } from './cameraZoom';

/** The back camera of the Android phone the camera report came from. */
const android = { min: 1, max: 10, step: 0.1 };

describe('zoomRange', () => {
  it('reads the range a camera reports', () => {
    expect(zoomRange({ zoom: { min: 1, max: 10, step: 0.1 } })).toEqual(android);
  });

  it('has no range for a camera without zoom, or a browser without capabilities', () => {
    expect(zoomRange({ width: { min: 1, max: 4000 } })).toBeNull();
    expect(zoomRange(undefined)).toBeNull();
  });

  it('has no range when the camera can only sit at one zoom', () => {
    expect(zoomRange({ zoom: { min: 1, max: 1, step: 0.1 } })).toBeNull();
  });

  it('steps by a tenth when the camera gives no step', () => {
    expect(zoomRange({ zoom: { min: 1, max: 5 } })).toEqual({ min: 1, max: 5, step: 0.1 });
  });
});

describe('clampZoom', () => {
  it('keeps the zoom inside the range', () => {
    expect(clampZoom(0.5, android)).toBe(1);
    expect(clampZoom(14, android)).toBe(10);
  });

  it('snaps to the nearest step', () => {
    expect(clampZoom(2.34, android)).toBe(2.3);
    expect(clampZoom(2.36, android)).toBe(2.4);
  });
});

describe('zoomStops', () => {
  it('offers the stops the camera reaches', () => {
    expect(zoomStops(android)).toEqual([1, 2, 4, 8]);
  });

  it('offers 0.5 on a camera that zooms out', () => {
    expect(zoomStops({ min: 0.5, max: 3, step: 0.1 })).toEqual([0.5, 1, 2]);
  });

  it('offers no chips when only one stop fits', () => {
    expect(zoomStops({ min: 1, max: 1.8, step: 0.1 })).toEqual([]);
  });
});

describe('activeStop', () => {
  it('lights the stop at or just below the zoom', () => {
    expect(activeStop(1, [1, 2, 4])).toBe(1);
    expect(activeStop(2.7, [1, 2, 4])).toBe(2);
    expect(activeStop(9, [1, 2, 4])).toBe(4);
  });

  it('lights the lowest stop below every stop, and none without stops', () => {
    expect(activeStop(0.8, [1, 2])).toBe(1);
    expect(activeStop(2, [])).toBeNull();
  });
});

describe('pinchZoom', () => {
  it('doubles the zoom when the fingers spread to twice their distance', () => {
    expect(pinchZoom(2, 100, 200, android)).toBe(4);
  });

  it('halves it when they pinch to half, but not below the range', () => {
    expect(pinchZoom(4, 200, 100, android)).toBe(2);
    expect(pinchZoom(1.5, 200, 50, android)).toBe(1);
  });

  it('keeps the zoom when the fingers started on the same spot', () => {
    expect(pinchZoom(3, 0, 120, android)).toBe(3);
  });
});

describe('createZoomApplier', () => {
  it('applies one zoom at a time, then only the latest that came in meanwhile', async () => {
    let finish: () => void = () => {};
    const apply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const setZoom = createZoomApplier(apply);

    setZoom(2);
    setZoom(2.5);
    setZoom(3);
    expect(apply.mock.calls).toEqual([[2]]);

    finish();
    await vi.waitFor(() => expect(apply.mock.calls).toEqual([[2], [3]]));
  });

  it('carries on after the camera refuses a zoom', async () => {
    const apply = vi.fn().mockRejectedValueOnce(new DOMException('no', 'OverconstrainedError')).mockResolvedValue(undefined);
    const setZoom = createZoomApplier(apply);

    setZoom(20);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    setZoom(2);

    await vi.waitFor(() => expect(apply).toHaveBeenLastCalledWith(2));
  });
});
