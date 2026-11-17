import { describe, expect, it } from 'vitest';
import { createUndoStack } from './undo';

describe('createUndoStack', () => {
  it('undoes and redoes recorded states in order', () => {
    const stack = createUndoStack<string>();
    stack.reset('a');
    stack.record('b');
    stack.record('c');
    expect(stack.undo()).toBe('b');
    expect(stack.undo()).toBe('a');
    expect(stack.undo()).toBeNull();
    expect(stack.redo()).toBe('b');
    expect(stack.redo()).toBe('c');
    expect(stack.redo()).toBeNull();
  });

  it('ignores re-recording the current state, as when an undo is applied', () => {
    const stack = createUndoStack<string>();
    stack.reset('a');
    stack.record('b');
    const restored = stack.undo()!;
    stack.record(restored);
    expect(stack.canRedo()).toBe(true);
    expect(stack.redo()).toBe('b');
  });

  it('drops the redo branch after a new edit', () => {
    const stack = createUndoStack<string>();
    stack.reset('a');
    stack.record('b');
    stack.undo();
    stack.record('x');
    expect(stack.canRedo()).toBe(false);
    expect(stack.undo()).toBe('a');
  });

  it('keeps at most the limit of past states and forgets them on reset', () => {
    const stack = createUndoStack<number>(2);
    stack.reset(0);
    [1, 2, 3].forEach((n) => stack.record(n));
    expect(stack.undo()).toBe(2);
    expect(stack.undo()).toBe(1);
    expect(stack.canUndo()).toBe(false);
    stack.reset(9);
    expect(stack.canRedo()).toBe(false);
  });
});
