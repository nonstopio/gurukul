/**
 * A port whose real implementation loads later. Every method waits for `load()` and then forwards;
 * the ones named in `watchers` return an unsubscribe function at once, so they forward when the
 * implementation arrives and cancel it if the caller unsubscribes first.
 */
export function lazyPort<T extends object>(
  load: () => Promise<T>,
  watchers: readonly (keyof T)[] = [],
): T {
  return new Proxy({} as T, {
    get(_target, name) {
      const method = name as keyof T;
      if (watchers.includes(method)) {
        return (...args: unknown[]) => {
          let stop: (() => void) | undefined;
          let cancelled = false;
          void load().then((impl) => {
            const unsubscribe = (impl[method] as (...a: unknown[]) => () => void)(...args);
            if (cancelled) unsubscribe();
            else stop = unsubscribe;
          });
          return () => {
            cancelled = true;
            stop?.();
          };
        };
      }
      return async (...args: unknown[]) =>
        ((await load())[method] as (...a: unknown[]) => unknown)(...args);
    },
  });
}
