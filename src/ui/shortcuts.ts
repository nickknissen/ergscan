export type ShortcutAction = 'back' | 'save' | 'open' | 'undo' | 'redo';

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

interface ShortcutContext {
  stage: string;
  editing: boolean;
  overlayOpen: boolean;
}

const BACK_STAGES = ['camera', 'guide', 'review'];
export const IMAGE_STAGES = ['capture', 'history', 'settings'];
const NON_TEXT_INPUTS = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];

export function appShortcut(event: KeyLike, context: ShortcutContext): ShortcutAction | null {
  if (event.defaultPrevented) return null;
  const modified = (event.ctrlKey || event.metaKey) && !event.altKey;
  const command = modified && !event.shiftKey;
  const key = event.key.toLowerCase();
  if (modified && context.stage === 'review' && !context.editing && !context.overlayOpen) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && !event.shiftKey) return 'redo';
  }
  if (command && event.key.toLowerCase() === 's' && context.stage === 'review') return 'save';
  if (command && event.key.toLowerCase() === 'o' && !context.overlayOpen && IMAGE_STAGES.includes(context.stage)) return 'open';
  if (event.key === 'Escape' && !context.editing && !context.overlayOpen && BACK_STAGES.includes(context.stage)) return 'back';
  return null;
}

export function isTextField(element: { tagName: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return true;
  return element.tagName === 'INPUT' && !NON_TEXT_INPUTS.includes(element.type ?? 'text');
}

export function cellEscape(text: string, committed: string): 'revert' | 'blur' {
  return text === committed ? 'blur' : 'revert';
}
