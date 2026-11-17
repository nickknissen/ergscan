import { describe, expect, it } from 'vitest';
import { lostChosenCamera, nextCamera, videoConstraints, videoInputs } from './cameraChoice';

describe('videoConstraints', () => {
  it('asks for the back camera until one is chosen', () => {
    expect(videoConstraints(null)).toMatchObject({ facingMode: { ideal: 'environment' } });
    expect(videoConstraints('usb')).toMatchObject({ deviceId: { exact: 'usb' } });
    expect(videoConstraints('usb')).not.toHaveProperty('facingMode');
  });
});

describe('videoInputs', () => {
  it('keeps cameras with an id', () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'mic' },
      { kind: 'videoinput', deviceId: 'front' },
      { kind: 'videoinput', deviceId: '' },
      { kind: 'videoinput', deviceId: 'usb' },
    ];
    expect(videoInputs(devices).map((d) => d.deviceId)).toEqual(['front', 'usb']);
  });
});

describe('nextCamera', () => {
  const cameras = [{ deviceId: 'back' }, { deviceId: 'front' }, { deviceId: 'usb' }];

  it('cycles through the cameras', () => {
    expect(nextCamera(cameras, 'back')).toBe('front');
    expect(nextCamera(cameras, 'usb')).toBe('back');
  });

  it('starts at the first camera when the current one is unknown', () => {
    expect(nextCamera(cameras, null)).toBe('back');
  });

  it('offers nothing with a single camera', () => {
    expect(nextCamera([{ deviceId: 'back' }], 'back')).toBeNull();
  });
});

describe('lostChosenCamera', () => {
  it('detects a chosen camera that is no longer available', () => {
    expect(lostChosenCamera(new DOMException('gone', 'OverconstrainedError'), 'usb')).toBe(true);
    expect(lostChosenCamera(new DOMException('gone', 'NotFoundError'), 'usb')).toBe(true);
    expect(lostChosenCamera(new DOMException('gone', 'NotFoundError'), null)).toBe(false);
    expect(lostChosenCamera(new DOMException('no', 'NotAllowedError'), 'usb')).toBe(false);
  });
});
