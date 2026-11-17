import { describe, expect, it } from 'vitest';
import { appShortcut, cellEscape, isTextField } from './shortcuts';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  ...mods,
});
const idle = { editing: false, overlayOpen: false };

describe('appShortcut', () => {
  it('saves with Ctrl+S or Cmd+S on review', () => {
    expect(appShortcut(key('s', { ctrlKey: true }), { ...idle, stage: 'review' })).toBe('save');
    expect(appShortcut(key('S', { metaKey: true }), { ...idle, stage: 'review', editing: true })).toBe('save');
  });

  it('leaves Ctrl+S to the browser elsewhere and with extra modifiers', () => {
    expect(appShortcut(key('s', { ctrlKey: true }), { ...idle, stage: 'history' })).toBeNull();
    expect(appShortcut(key('s', { ctrlKey: true, shiftKey: true }), { ...idle, stage: 'review' })).toBeNull();
    expect(appShortcut(key('s'), { ...idle, stage: 'review' })).toBeNull();
  });

  it('opens an image with Ctrl+O on the tab screens only', () => {
    expect(appShortcut(key('o', { ctrlKey: true }), { ...idle, stage: 'capture' })).toBe('open');
    expect(appShortcut(key('O', { metaKey: true }), { ...idle, stage: 'history' })).toBe('open');
    expect(appShortcut(key('o', { ctrlKey: true }), { ...idle, stage: 'review' })).toBeNull();
    expect(appShortcut(key('o', { ctrlKey: true }), { ...idle, stage: 'capture', overlayOpen: true })).toBeNull();
  });

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y on review', () => {
    expect(appShortcut(key('z', { ctrlKey: true }), { ...idle, stage: 'review' })).toBe('undo');
    expect(appShortcut(key('Z', { metaKey: true, shiftKey: true }), { ...idle, stage: 'review' })).toBe('redo');
    expect(appShortcut(key('y', { ctrlKey: true }), { ...idle, stage: 'review' })).toBe('redo');
  });

  it('leaves undo to text fields, dialogs and other screens', () => {
    expect(appShortcut(key('z', { ctrlKey: true }), { ...idle, stage: 'review', editing: true })).toBeNull();
    expect(appShortcut(key('z', { ctrlKey: true }), { ...idle, stage: 'review', overlayOpen: true })).toBeNull();
    expect(appShortcut(key('z', { ctrlKey: true }), { ...idle, stage: 'history' })).toBeNull();
  });

  it('goes back with Esc from the camera, guide and review', () => {
    for (const stage of ['camera', 'guide', 'review']) expect(appShortcut(key('Escape'), { ...idle, stage })).toBe('back');
  });

  it('ignores Esc on tab screens', () => {
    for (const stage of ['capture', 'history', 'settings']) expect(appShortcut(key('Escape'), { ...idle, stage })).toBeNull();
  });

  it('leaves Esc to text fields, dialogs and menus', () => {
    expect(appShortcut(key('Escape'), { ...idle, stage: 'review', editing: true })).toBeNull();
    expect(appShortcut(key('Escape'), { ...idle, stage: 'review', overlayOpen: true })).toBeNull();
    expect(appShortcut(key('Escape', { defaultPrevented: true }), { ...idle, stage: 'review' })).toBeNull();
  });
});

describe('isTextField', () => {
  it('treats text inputs, textareas and editable content as text fields', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'datetime-local' })).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('does not treat checkboxes, buttons or nothing as text fields', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('cellEscape', () => {
  it('reverts an edited cell and blurs an untouched one', () => {
    expect(cellEscape('2:01', '2:00.0')).toBe('revert');
    expect(cellEscape('2:00.0', '2:00.0')).toBe('blur');
  });
});
