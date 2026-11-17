export interface UndoStack<T> {
  reset(state: T): void;
  record(state: T): void;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function createUndoStack<T>(limit = 100): UndoStack<T> {
  let past: T[] = [];
  let future: T[] = [];
  let current: T | null = null;

  return {
    reset(state) {
      past = [];
      future = [];
      current = state;
    },
    record(state) {
      if (state === current) return;
      if (current !== null) past = [...past, current].slice(-limit);
      future = [];
      current = state;
    },
    undo() {
      const previous = past.at(-1);
      if (previous === undefined || current === null) return null;
      past = past.slice(0, -1);
      future = [...future, current];
      current = previous;
      return previous;
    },
    redo() {
      const next = future.at(-1);
      if (next === undefined || current === null) return null;
      future = future.slice(0, -1);
      past = [...past, current];
      current = next;
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
