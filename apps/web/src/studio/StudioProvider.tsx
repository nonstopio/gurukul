import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MediaStorage, PublishChecks, StudioData, StudioService } from './types';

interface StudioValue {
  data: StudioData;
  service: StudioService;
  /** Cloud Storage for lesson uploads; its SDK loads on the first upload. */
  storage: MediaStorage;
  /** Where uploads live, for the inline publish checks. */
  checks: PublishChecks;
}

const Ctx = createContext<StudioValue | null>(null);

export function StudioProvider({
  data,
  service,
  storage,
  checks,
  children,
}: StudioValue & { children: ReactNode }) {
  // The one place a change made here drops the remembered course list: every service call that
  // succeeds (create, publish, rollback, archive, access) makes it stale.
  const watched = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(service).map((name) => [
          name,
          async (...args: unknown[]) => {
            const result = await (
              service[name as keyof StudioService] as (...a: unknown[]) => Promise<unknown>
            )(...args);
            void data.forgetCourses();
            return result;
          },
        ]),
      ) as unknown as StudioService,
    [service, data],
  );
  return (
    <Ctx.Provider value={{ data, service: watched, storage, checks }}>{children}</Ctx.Provider>
  );
}

/** The Studio's data and callables. Throws outside `StudioProvider`: a missing provider is a bug. */
export function useStudio(): StudioValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useStudio must be used inside <StudioProvider>');
  return value;
}
