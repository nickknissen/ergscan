import { describe, expect, it } from 'vitest';
import { captureRect, guideRectInView, viewRectToVideo } from './guide';

const guide = { widthFraction: 0.8, aspect: 1, margin: 0 };

describe('guideRectInView', () => {
  it('centres a square guide sized by the narrow side of a portrait view', () => {
    expect(guideRectInView({ width: 400, height: 600 }, guide)).toEqual({ x: 40, y: 140, width: 320, height: 320 });
  });

  it('is limited by height in a landscape view', () => {
    expect(guideRectInView({ width: 1000, height: 500 }, guide)).toEqual({ x: 300, y: 50, width: 400, height: 400 });
  });
});

describe('viewRectToVideo', () => {
  it('maps through object-fit cover when the video is wider than the view', () => {
    const rect = viewRectToVideo({ x: 40, y: 140, width: 320, height: 320 }, { width: 400, height: 600 }, { width: 1920, height: 1080 });
    expect(rect).toEqual({ x: 672, y: 252, width: 576, height: 576 });
  });

  it('maps 1:1 scaled when aspect ratios match', () => {
    const rect = viewRectToVideo({ x: 10, y: 20, width: 100, height: 50 }, { width: 200, height: 100 }, { width: 400, height: 200 });
    expect(rect).toEqual({ x: 20, y: 40, width: 200, height: 100 });
  });

  it('clamps to the video bounds', () => {
    const rect = viewRectToVideo({ x: -50, y: -50, width: 400, height: 400 }, { width: 200, height: 200 }, { width: 200, height: 200 });
    expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });
});

describe('captureRect', () => {
  it('adds the margin around the guide before mapping', () => {
    const rect = captureRect({ width: 400, height: 600 }, { width: 800, height: 1200 }, { ...guide, margin: 0.1 });
    expect(rect).toEqual({ x: 16, y: 216, width: 768, height: 768 });
  });
});
