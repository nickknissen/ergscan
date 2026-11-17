import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from './route';

describe('parseRoute', () => {
  it('reads the guide and saved workouts', () => {
    expect(parseRoute('#/guide')).toEqual({ page: 'guide' });
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
    const routes: Route[] = [{ page: 'home' }, { page: 'guide' }, { page: 'workout', id: null }, { page: 'workout', id: 'a b/c' }];
    for (const route of routes) expect(parseRoute(routeHash(route) || '')).toEqual(route);
  });

  it('gives home an empty hash', () => {
    expect(routeHash({ page: 'home' })).toBe('');
  });
});
