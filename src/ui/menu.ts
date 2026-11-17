export function nextOptionIndex(index: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export interface MenuPlacement {
  left: number;
  top: number;
  above: boolean;
}

export function placeMenu(
  anchor: { left: number; right: number; top: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
  offset = 4,
): MenuPlacement {
  const left = Math.max(margin, Math.min(anchor.right - menu.width, viewport.width - menu.width - margin));
  const spaceBelow = viewport.height - anchor.bottom - offset - margin;
  const spaceAbove = anchor.top - offset - margin;
  const above = menu.height > spaceBelow && spaceAbove > spaceBelow;
  const top = above ? anchor.top - offset - menu.height : anchor.bottom + offset;
  return { left, top, above };
}
