export const MONITORS = ['pm5', 'pm4'] as const;
export type Monitor = (typeof MONITORS)[number];

export type Route =
  | { page: 'home' }
  | { page: 'history' }
  | { page: 'settings' }
  | { page: 'guide'; monitor: Monitor | null }
  | { page: 'workout'; id: string | null };

export const TABS = ['capture', 'history', 'settings'] as const;
export type TabStage = (typeof TABS)[number];

const NEW_WORKOUT = 'new';

export function tabRoute(tab: TabStage): Route {
  return tab === 'capture' ? { page: 'home' } : { page: tab };
}

export function routeTab(route: Route): TabStage {
  return route.page === 'history' || route.page === 'settings' ? route.page : 'capture';
}

export function parseRoute(hash: string): Route {
  if (hash === '#/history') return { page: 'history' };
  if (hash === '#/settings') return { page: 'settings' };
  if (hash === '#/guide') return { page: 'guide', monitor: null };
  const monitor = /^#\/guide\/([^/]+)$/.exec(hash)?.[1];
  if (monitor) return MONITORS.includes(monitor as Monitor) ? { page: 'guide', monitor: monitor as Monitor } : { page: 'guide', monitor: null };
  const encoded = /^#\/workout\/([^/]+)$/.exec(hash)?.[1];
  if (!encoded) return { page: 'home' };
  try {
    const id = decodeURIComponent(encoded);
    return { page: 'workout', id: id === NEW_WORKOUT ? null : id };
  } catch {
    return { page: 'home' };
  }
}

export function routeHash(route: Route): string {
  if (route.page === 'history' || route.page === 'settings') return `#/${route.page}`;
  if (route.page === 'guide') return route.monitor ? `#/guide/${route.monitor}` : '#/guide';
  if (route.page === 'workout') return `#/workout/${route.id === null ? NEW_WORKOUT : encodeURIComponent(route.id)}`;
  return '';
}
