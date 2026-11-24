/**
 * Asks the browser to keep this site's data when space runs low, so saved workouts aren't cleared
 * along with caches. Chrome answers without asking (it grants installed and often used sites);
 * Firefox asks once and remembers. Safari still deletes the data of a site that isn't on the home
 * screen after seven days without a visit, whatever the answer, which is what history export is for.
 * Resolves to whether the data is kept; never rejects.
 */
export async function persistStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (typeof storage?.persist !== 'function' || typeof storage.persisted !== 'function') return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}
