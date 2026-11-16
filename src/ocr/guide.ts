import type { Rect } from './crop';

export interface Size {
  width: number;
  height: number;
}

export interface Guide {
  widthFraction: number;
  aspect: number;
  margin: number;
}

export const SCREEN_GUIDE: Guide = { widthFraction: 0.82, aspect: 1, margin: 0.06 };

export function guideRectInView(view: Size, guide: Guide = SCREEN_GUIDE): Rect {
  const width = Math.min(view.width * guide.widthFraction, view.height * guide.widthFraction * guide.aspect);
  const height = width / guide.aspect;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

export function viewRectToVideo(rect: Rect, view: Size, video: Size): Rect {
  const scale = Math.max(view.width / video.width, view.height / video.height);
  const offsetX = (view.width - video.width * scale) / 2;
  const offsetY = (view.height - video.height * scale) / 2;
  const x0 = Math.max(0, Math.round((rect.x - offsetX) / scale));
  const y0 = Math.max(0, Math.round((rect.y - offsetY) / scale));
  const x1 = Math.min(video.width, Math.round((rect.x + rect.width - offsetX) / scale));
  const y1 = Math.min(video.height, Math.round((rect.y + rect.height - offsetY) / scale));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function captureRect(view: Size, video: Size, guide: Guide = SCREEN_GUIDE): Rect {
  const g = guideRectInView(view, guide);
  const mx = g.width * guide.margin;
  const my = g.height * guide.margin;
  return viewRectToVideo({ x: g.x - mx, y: g.y - my, width: g.width + 2 * mx, height: g.height + 2 * my }, view, video);
}
