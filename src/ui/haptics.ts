/** Two quick pulses: something worked. */
const confirmation = [20, 40, 20];

/** The few moments that buzz the phone. Keep this list short: a buzz on every tap stops meaning anything. */
const patterns = {
  /** The in-app camera took its photo. */
  shutter: 15,
  /** A photo was read into splits, after the wait on the scanning screen. */
  read: confirmation,
  /** A photo could not be read, so the review screen opens with a notice. */
  unread: [40, 60, 40, 60, 40],
  /** A workout was saved to history. */
  saved: confirmation,
} satisfies Record<string, VibratePattern>;

export type BuzzMoment = keyof typeof patterns;

/**
 * A short buzz for one of the named moments. Android vibrates the pattern. An iPhone has no `navigator.vibrate`, so
 * it gets one haptic tick per pulse instead, at the pulse's start. Elsewhere, and outside a browser, nothing happens.
 */
export function buzz(moment: BuzzMoment): void {
  if (typeof navigator === 'undefined') return;
  if ('vibrate' in navigator) {
    navigator.vibrate(patterns[moment]);
    return;
  }
  if (typeof document === 'undefined') return;

  const pattern: number[] = [patterns[moment]].flat();
  let startsAt = 0;
  pattern.forEach((duration, index) => {
    if (index % 2 === 0) setTimeout(tickOnIphone, startsAt);
    startsAt += duration;
  });
}

/**
 * Safari on iOS 18+ ticks the Taptic Engine when a switch flips, even a hidden one flipped from code, so this flips
 * a throwaway one. Anywhere else the switch is just a checkbox, and the flip does nothing you can feel or see. The
 * click stops at the label, so no outside-click handler mistakes it for a tap on the page.
 */
function tickOnIphone(): void {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  label.addEventListener('click', (event) => event.stopPropagation());

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('switch', '');
  label.appendChild(toggle);

  document.body.appendChild(label);
  label.click();
  label.remove();
}
