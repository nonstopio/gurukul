import { createContext, useContext } from 'react';
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
  return <Ctx.Provider value={{ data, service, storage, checks }}>{children}</Ctx.Provider>;
}

/** The Studio's data and callables. Throws outside `StudioProvider`: a missing provider is a bug. */
export function useStudio(): StudioValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useStudio must be used inside <StudioProvider>');
  return value;
}
