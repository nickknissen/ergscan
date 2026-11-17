const TIME_RE = /^(?:(\d{1,2}):)?(\d{0,2}):(\d{2})(?:\.(\d))?$/;

function dotsAsColons(text: string): string {
  if (text.includes(':')) return text;
  const parts = text.split('.');
  if (parts.length < 3) return text;
  const last = parts[parts.length - 1]!;
  return last.length === 1 ? `${parts.slice(0, -1).join(':')}.${last}` : parts.join(':');
}

export function parseTime(text: string): number | null {
  const m = TIME_RE.exec(dotsAsColons(text.trim()));
  if (!m) return null;
  const [, h, min, sec, tenth] = m;
  const seconds = Number(sec);
  if (seconds >= 60) return null;
  const minutes = min ? Number(min) : 0;
  if (h !== undefined && minutes >= 60) return null;
  const total = (Number(h ?? 0) * 3600 + minutes * 60 + seconds) * 10 + Number(tenth ?? 0);
  return total;
}

export function formatTime(deciseconds: number): string {
  const ds = Math.round(deciseconds);
  const tenth = ds % 10;
  const totalSeconds = Math.floor(ds / 10);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}.${tenth}`;
  return `${m}:${ss}.${tenth}`;
}
