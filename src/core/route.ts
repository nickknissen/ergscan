export type Route = { page: 'home' } | { page: 'guide' } | { page: 'workout'; id: string | null };

const NEW_WORKOUT = 'new';

export function parseRoute(hash: string): Route {
  if (hash === '#/guide') return { page: 'guide' };
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
  if (route.page === 'guide') return '#/guide';
  if (route.page === 'workout') return `#/workout/${route.id === null ? NEW_WORKOUT : encodeURIComponent(route.id)}`;
  return '';
}
