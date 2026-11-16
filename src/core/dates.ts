import type { ScreenDate } from './pm5Parser';

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi);
}

export function startTimeFor(screenDate: ScreenDate | null | undefined, photoTime: Date, elapsedDs: number): Date {
  const start = new Date(photoTime.getTime() - elapsedDs * 100);
  if (!screenDate) return start;
  const { year, month, day } = screenDate;
  if (start.getFullYear() === year && start.getMonth() + 1 === month && start.getDate() === day) return start;
  return new Date(year, month - 1, day, 12, 0);
}

export function fitFileName(start: Date): string {
  return `ergscan-${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}-${pad(start.getHours())}${pad(start.getMinutes())}.fit`;
}
