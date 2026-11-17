import { describe, expect, it } from 'vitest';
import { historyPane, listDetail, type LayoutState } from './layout';

const base: LayoutState = { wide: true, stage: 'review', reviewOrigin: 'history', sourcePanel: false, entries: 3 };

describe('listDetail', () => {
  it('shows a saved workout beside the list on wide windows', () => {
    expect(listDetail(base)).toBe(true);
  });

  it('keeps the single-pane review on narrow windows, for new scans and beside the photo panel', () => {
    expect(listDetail({ ...base, wide: false })).toBe(false);
    expect(listDetail({ ...base, reviewOrigin: 'capture' })).toBe(false);
    expect(listDetail({ ...base, sourcePanel: true })).toBe(false);
  });
});

describe('historyPane', () => {
  it('shows the list pane on the history tab and in list-detail review', () => {
    expect(historyPane({ ...base, stage: 'history' })).toBe(true);
    expect(historyPane(base)).toBe(true);
  });

  it('falls back to the full-width screen when there is nothing to list or no room', () => {
    expect(historyPane({ ...base, stage: 'history', entries: 0 })).toBe(false);
    expect(historyPane({ ...base, stage: 'history', wide: false })).toBe(false);
    expect(historyPane({ ...base, stage: 'settings' })).toBe(false);
  });
});
