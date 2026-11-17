export type ScreenTransition = 'fade-through' | 'axis-forward' | 'axis-back';

const TOP_LEVEL = new Set(['capture', 'guide', 'history', 'settings', 'camera']);

export function screenTransition(from: string, to: string): ScreenTransition {
  const fromTop = TOP_LEVEL.has(from);
  const toTop = TOP_LEVEL.has(to);
  if (fromTop && !toTop) return 'axis-forward';
  if (!fromTop && toTop) return 'axis-back';
  return 'fade-through';
}

export function fabCollapsed(previousY: number, y: number, collapsed: boolean): boolean {
  if (y <= 0) return false;
  if (y > previousY) return true;
  if (y < previousY) return false;
  return collapsed;
}
