import { inject, onBeforeUnmount, provide, reactive, watch, type InjectionKey, type Ref } from 'vue';

const INVALID_CELLS: InjectionKey<Set<symbol>> = Symbol('invalidCells');

export const CELL_HINT_ID = 'cell-format-hint';

export function provideInvalidCells(): Set<symbol> {
  const cells = reactive(new Set<symbol>());
  provide(INVALID_CELLS, cells);
  return cells;
}

export function trackCellValidity(invalid: Ref<boolean>): void {
  const cells = inject(INVALID_CELLS, null);
  const id = Symbol();
  watch(invalid, (value) => (value ? cells?.add(id) : cells?.delete(id)));
  onBeforeUnmount(() => cells?.delete(id));
}
