export interface Selection {
  selected: string[];
  anchor: string | null;
}

export function nextSelection(current: Selection, ids: readonly string[], clicked: string, mods: { toggle: boolean; range: boolean }): Selection {
  const anchorIndex = current.anchor === null ? -1 : ids.indexOf(current.anchor);
  if (mods.range && anchorIndex >= 0) {
    const clickedIndex = ids.indexOf(clicked);
    const [from, to] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
    const range = ids.slice(from, to + 1);
    const base = mods.toggle ? current.selected : [];
    return { selected: ids.filter((id) => base.includes(id) || range.includes(id)), anchor: current.anchor };
  }
  if (mods.range || mods.toggle) {
    const selected = current.selected.includes(clicked) ? current.selected.filter((id) => id !== clicked) : [...current.selected, clicked];
    return { selected: ids.filter((id) => selected.includes(id)), anchor: clicked };
  }
  return { selected: [], anchor: null };
}

export function keepExisting(current: Selection, ids: readonly string[]): Selection {
  const selected = current.selected.filter((id) => ids.includes(id));
  return { selected, anchor: current.anchor !== null && ids.includes(current.anchor) ? current.anchor : null };
}
