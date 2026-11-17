import { onBeforeUnmount, ref, type ShallowRef } from 'vue';
import { nextOptionIndex, placeMenu } from './menu';

type ElementRef = Readonly<ShallowRef<HTMLElement | null>>;

export function usePopoverMenu(trigger: ElementRef, menu: ElementRef, itemSelector: string, initialIndex: () => number) {
  const open = ref(false);

  function items(): HTMLElement[] {
    return [...(menu.value?.querySelectorAll<HTMLElement>(itemSelector) ?? [])];
  }

  function focusItem(index: number) {
    items()[index]?.focus();
  }

  function place() {
    const m = menu.value;
    const t = trigger.value;
    if (!m || !t) return;
    const anchor = t.getBoundingClientRect();
    m.style.minWidth = `${anchor.width}px`;
    const { left, top, above } = placeMenu(anchor, { width: m.offsetWidth, height: m.offsetHeight }, { width: innerWidth, height: innerHeight });
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;
    m.style.transformOrigin = above ? 'bottom' : 'top';
  }

  function close() {
    if (menu.value?.matches(':popover-open')) menu.value.hidePopover();
  }

  function show() {
    menu.value?.showPopover();
  }

  function stopListening() {
    removeEventListener('resize', close);
    removeEventListener('scroll', close, true);
  }

  function onToggle(event: Event) {
    open.value = (event as ToggleEvent).newState === 'open';
    if (!open.value) {
      stopListening();
      return;
    }
    place();
    focusItem(Math.max(0, initialIndex()));
    addEventListener('resize', close);
    addEventListener('scroll', close, true);
  }

  function onItemKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'Tab') {
      close();
      return;
    }
    const next = nextOptionIndex(index, event.key, items().length);
    if (next === null) return;
    event.preventDefault();
    focusItem(next);
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    show();
  }

  onBeforeUnmount(stopListening);

  return { open, close, onToggle, onItemKeydown, onTriggerKeydown };
}
