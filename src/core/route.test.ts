import { describe, expect, it } from 'vitest';
import { parseRoute, popAction, routeHash, routeTab, TABS, tabRoute, type Route } from './route';

describe('parseRoute', () => {
  it('reads the tabs', () => {
    expect(parseRoute('#/history')).toEqual({ page: 'history' });
    expect(parseRoute('#/settings')).toEqual({ page: 'settings' });
  });

  it('reads the guide with and without a monitor', () => {
    expect(parseRoute('#/guide/pm5')).toEqual({ page: 'guide', monitor: 'pm5' });
    expect(parseRoute('#/guide/pm4')).toEqual({ page: 'guide', monitor: 'pm4' });
    expect(parseRoute('#/guide/pm3')).toEqual({ page: 'guide', monitor: 'pm3' });
  });

  it('falls back to the monitor picker for an unknown monitor', () => {
    expect(parseRoute('#/guide/pm2')).toEqual({ page: 'guide', monitor: null });
  });

  it('reads the guide and saved workouts', () => {
    expect(parseRoute('#/guide')).toEqual({ page: 'guide', monitor: null });
    expect(parseRoute('#/workout/0f3c2a7e-1b2d-4c5e-9f00-123456789abc')).toEqual({
      page: 'workout',
      id: '0f3c2a7e-1b2d-4c5e-9f00-123456789abc',
    });
  });

  it('reads an unsaved workout as having no id', () => {
    expect(parseRoute('#/workout/new')).toEqual({ page: 'workout', id: null });
  });

  it('treats anything else as home', () => {
    expect(parseRoute('')).toEqual({ page: 'home' });
    expect(parseRoute('#/workout/')).toEqual({ page: 'home' });
    expect(parseRoute('#/workout/a/b')).toEqual({ page: 'home' });
    expect(parseRoute('#/elsewhere')).toEqual({ page: 'home' });
    expect(parseRoute('#/workout/%E0')).toEqual({ page: 'home' });
  });
});

describe('routeHash', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { page: 'home' },
      { page: 'history' },
      { page: 'settings' },
      { page: 'guide', monitor: null },
      { page: 'guide', monitor: 'pm5' },
      { page: 'guide', monitor: 'pm4' },
      { page: 'workout', id: null },
      { page: 'workout', id: 'a b/c' },
    ];
    for (const route of routes) expect(parseRoute(routeHash(route) || '')).toEqual(route);
  });

  it('gives home an empty hash', () => {
    expect(routeHash({ page: 'home' })).toBe('');
  });
});

describe('tabs', () => {
  it('round-trips every tab through its route', () => {
    for (const tab of TABS) expect(routeTab(tabRoute(tab))).toBe(tab);
  });

  it('puts the scan tab at the bare URL', () => {
    expect(routeHash(tabRoute('capture'))).toBe('');
    expect(routeHash(tabRoute('settings'))).toBe('#/settings');
  });

  it('shows the scan tab behind non-tab pages', () => {
    expect(routeTab({ page: 'guide', monitor: 'pm4' })).toBe('capture');
    expect(routeTab({ page: 'workout', id: null })).toBe('capture');
  });
});

describe('popAction', () => {
  const home: Route = { page: 'home' };
  const history: Route = { page: 'history' };
  const saved: Route = { page: 'workout', id: 'abc' };

  it('asks before leaving the review screen for any other page', () => {
    expect(popAction('review', home, null)).toEqual({ kind: 'backFromReview' });
    expect(popAction('review', { page: 'guide', monitor: null }, null)).toEqual({ kind: 'backFromReview' });
  });

  it('stays put on the review screen when the page is still a workout', () => {
    expect(popAction('review', saved, null)).toEqual({ kind: 'none' });
  });

  it('shows the guide page it moved to', () => {
    expect(popAction('capture', { page: 'guide', monitor: 'pm4' }, null)).toEqual({ kind: 'guide', monitor: 'pm4' });
    expect(popAction('guide', { page: 'guide', monitor: null }, null)).toEqual({ kind: 'guide', monitor: null });
  });

  it('leaves the guide for the tab chosen before stepping back, even through guide pages', () => {
    expect(popAction('guide', { page: 'guide', monitor: null }, 'history')).toEqual({ kind: 'closeGuide', to: 'history' });
    expect(popAction('guide', home, 'settings')).toEqual({ kind: 'closeGuide', to: 'settings' });
  });

  it('leaves the guide for the page underneath when no tab was chosen', () => {
    expect(popAction('guide', history, null)).toEqual({ kind: 'closeGuide', to: 'history' });
    expect(popAction('guide', home, null)).toEqual({ kind: 'closeGuide', to: 'capture' });
  });

  it('opens a workout moved to with Forward', () => {
    expect(popAction('history', saved, null)).toEqual({ kind: 'openWorkout', id: 'abc' });
    expect(popAction('capture', { page: 'workout', id: null }, null)).toEqual({ kind: 'openWorkout', id: null });
  });

  it('switches tabs between tab pages', () => {
    expect(popAction('history', home, null)).toEqual({ kind: 'tab', to: 'capture' });
    expect(popAction('capture', { page: 'settings' }, null)).toEqual({ kind: 'tab', to: 'settings' });
  });

  it('ignores moves while scanning or using the camera', () => {
    expect(popAction('scanning', home, null)).toEqual({ kind: 'none' });
    expect(popAction('camera', history, null)).toEqual({ kind: 'none' });
  });
});
