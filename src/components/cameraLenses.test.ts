import { describe, expect, it, vi } from 'vitest';
import {
  backCameras,
  coversAllLenses,
  findLenses,
  lensSignature,
  loadLenses,
  preferredCamera,
  saveLenses,
  type CameraLens,
} from './cameraLenses';

/** The iPhone Pro from the camera report, in Danish. */
const iphone = [
  { deviceId: 'f', label: 'Forsidekamera' },
  { deviceId: 't', label: 'Tredobbelt kamera på bagsiden' },
  { deviceId: 'dw', label: 'Dobbelt vidvinkelkamera på bagsiden' },
  { deviceId: 'uw', label: 'Ultravidvinkelkameraet på bagsiden' },
  { deviceId: 'w', label: 'Bagsidekamera' },
];
const iphoneLenses: CameraLens[] = [
  { key: 'Forsidekamera', facing: 'user', zoomMin: 1 },
  { key: 'Tredobbelt kamera på bagsiden', facing: 'environment', zoomMin: 0.5 },
  { key: 'Dobbelt vidvinkelkamera på bagsiden', facing: 'environment', zoomMin: 0.5 },
  { key: 'Ultravidvinkelkameraet på bagsiden', facing: 'environment', zoomMin: 1 },
  { key: 'Bagsidekamera', facing: 'environment', zoomMin: 1 },
];

/** The second Android phone from the camera report: two selfie cameras, two back cameras, all zooming from 1×. */
const android = [
  { deviceId: 'c1', label: 'camera 1, facing front' },
  { deviceId: 'c3', label: 'camera 3, facing front' },
  { deviceId: 'c2', label: 'camera 2, facing back' },
  { deviceId: 'c0', label: 'camera 0, facing back' },
];
const androidLenses: CameraLens[] = [
  { key: 'camera 1, facing front', facing: 'user', zoomMin: 1 },
  { key: 'camera 3, facing front', facing: 'user', zoomMin: 1 },
  { key: 'camera 2, facing back', facing: 'environment', zoomMin: 1 },
  { key: 'camera 0, facing back', facing: 'environment', zoomMin: 1 },
];

describe('preferredCamera', () => {
  it("opens an iPhone's triple camera, which switches lenses by itself like the native Camera app", () => {
    expect(preferredCamera(iphone, iphoneLenses)?.deviceId).toBe('t');
  });

  it('leaves the choice to the browser when no back camera zooms below 1×', () => {
    expect(preferredCamera(android, androidLenses)).toBeNull();
  });

  it('never prefers a selfie camera, however far it zooms out', () => {
    expect(preferredCamera(android, [{ key: 'camera 1, facing front', facing: 'user', zoomMin: 0.5 }])).toBeNull();
  });

  it('prefers nothing before the cameras were looked at', () => {
    expect(preferredCamera(iphone, [])).toBeNull();
  });
});

describe('backCameras', () => {
  it('leaves out the selfie cameras', () => {
    expect(backCameras(android, androidLenses).map((d) => d.deviceId)).toEqual(['c2', 'c0']);
  });

  it('keeps every camera before they were looked at', () => {
    expect(backCameras(android, [])).toHaveLength(4);
  });
});

describe('coversAllLenses', () => {
  it('is true for a camera that zooms below 1×', () => {
    expect(coversAllLenses(0.5)).toBe(true);
    expect(coversAllLenses(1)).toBe(false);
    expect(coversAllLenses(null)).toBe(false);
  });
});

describe('the saved cameras', () => {
  function memoryStorage() {
    const items = new Map<string, string>();
    return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
  }

  it('come back for the same cameras', () => {
    const storage = memoryStorage();
    saveLenses(storage, lensSignature(iphone), iphoneLenses);

    expect(loadLenses(storage, lensSignature(iphone))).toEqual(iphoneLenses);
  });

  it('come back when the browser hands out new ids for the same cameras', () => {
    const storage = memoryStorage();
    saveLenses(storage, lensSignature(iphone), iphoneLenses);
    const newIds = iphone.map((d, i) => ({ ...d, deviceId: `new${i}` }));

    expect(loadLenses(storage, lensSignature(newIds))).toEqual(iphoneLenses);
  });

  it('are looked at again when a camera is added', () => {
    const storage = memoryStorage();
    saveLenses(storage, lensSignature(iphone), iphoneLenses);

    expect(loadLenses(storage, lensSignature([...iphone, { deviceId: 'usb', label: 'USB camera' }]))).toBeNull();
  });

  it('are looked at again when what was saved is unreadable', () => {
    expect(loadLenses({ getItem: () => '{not json' }, 'x')).toBeNull();
    expect(loadLenses(null, 'x')).toBeNull();
  });
});

describe('findLenses', () => {
  function fakeCamera(facingMode: string, zoomMin?: number) {
    const stop = vi.fn();
    const track = {
      getSettings: () => ({ facingMode }),
      getCapabilities: () => (zoomMin === undefined ? {} : { zoom: { min: zoomMin, max: 10 } }),
      stop,
    };
    return { media: { getVideoTracks: () => [track], getTracks: () => [track] }, stop };
  }

  it('opens each camera, notes its facing and how far it zooms out, and closes it again', async () => {
    const front = fakeCamera('user', 1);
    const triple = fakeCamera('environment', 0.5);
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const id = ((constraints.video as MediaTrackConstraints).deviceId as { exact: string }).exact;
      return (id === 'f' ? front : triple).media as unknown as MediaStream;
    });

    const lenses = await findLenses({ getUserMedia }, iphone.slice(0, 2), () => false);

    expect(lenses).toEqual([
      { key: 'Forsidekamera', facing: 'user', zoomMin: 1 },
      { key: 'Tredobbelt kamera på bagsiden', facing: 'environment', zoomMin: 0.5 },
    ]);
    expect(front.stop).toHaveBeenCalled();
    expect(triple.stop).toHaveBeenCalled();
  });

  it("skips opening a selfie camera the browser already names as one, as Chrome does", async () => {
    const getUserMedia = vi.fn(async () => fakeCamera('environment', 1).media as unknown as MediaStream);
    const front = { ...android[0]!, getCapabilities: () => ({ facingMode: ['user'] }) };

    const lenses = await findLenses({ getUserMedia }, [front, android[2]!], () => false);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(lenses?.[0]).toEqual({ key: 'camera 1, facing front', facing: 'user', zoomMin: null });
  });

  it('keeps a camera that will not open as unknown', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('busy', 'NotReadableError');
    });

    expect(await findLenses({ getUserMedia }, [android[2]!], () => false)).toEqual([
      { key: 'camera 2, facing back', facing: null, zoomMin: null },
    ]);
  });

  it('stops and returns nothing when the camera screen closes partway', async () => {
    let closed = false;
    const getUserMedia = vi.fn(async () => {
      closed = true;
      return fakeCamera('environment', 1).media as unknown as MediaStream;
    });

    expect(await findLenses({ getUserMedia }, android, () => closed)).toBeNull();
    expect(getUserMedia).toHaveBeenCalledOnce();
  });
});
