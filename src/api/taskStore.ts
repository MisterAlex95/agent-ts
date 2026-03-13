/**
 * In-memory store for running tasks (stream only) so they can be cancelled by id.
 */
const running = new Map<string, AbortController>();

export function registerTask(id: string, controller: AbortController): void {
  running.set(id, controller);
}

export function abortTask(id: string): boolean {
  const ctrl = running.get(id);
  if (!ctrl) return false;
  ctrl.abort();
  running.delete(id);
  return true;
}

export function unregisterTask(id: string): void {
  running.delete(id);
}
