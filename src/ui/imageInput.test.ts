import { describe, expect, it } from 'vitest';
import { carriesFiles, downloadUrlData, pickImage } from './imageInput';

describe('pickImage', () => {
  it('takes the first image and counts the other images', () => {
    const files = [{ type: 'text/plain', name: 'a' }, { type: 'image/png', name: 'b' }, { type: 'image/jpeg', name: 'c' }];
    expect(pickImage(files)).toEqual({ file: files[1], extra: 1 });
  });

  it('returns nothing without an image', () => {
    expect(pickImage([{ type: 'application/pdf' }])).toBeNull();
    expect(pickImage([])).toBeNull();
  });
});

describe('carriesFiles', () => {
  it('recognises drags that carry files', () => {
    expect(carriesFiles(['text/plain', 'Files'])).toBe(true);
    expect(carriesFiles(['text/uri-list'])).toBe(false);
    expect(carriesFiles(undefined)).toBe(false);
  });
});

describe('downloadUrlData', () => {
  it('formats the Chromium DownloadURL drag payload', () => {
    expect(downloadUrlData({ type: 'application/vnd.ant.fit', name: 'w.fit' }, 'blob:x/1')).toBe('application/vnd.ant.fit:w.fit:blob:x/1');
  });
});
