import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, routeTab, TABS, tabRoute, type Route } from './route';

describe('parseRoute', () => {
  it('reads the tabs', () => {
    expect(parseRoute('#/history')).toEqual({ page: 'history' });
    expect(parseRoute('#/settings')).toEqual({ page: 'settings' });
  });

  it('reads the guide with and without a monitor', () => {
    expect(parseRoute('#/guide/pm5')).toEqual({ page: 'guide', monitor: 'pm5' });
    expect(parseRoute('#/guide/pm4')).toEqual({ page: 'guide', monitor: 'pm4' });
  });

  it('falls back to the monitor picker for an unknown monitor', () => {
    expect(parseRoute('#/guide/pm3')).toEqual({ page: 'guide', monitor: null });
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
