import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { StudioData, StudioService } from './types';

interface StudioValue {
  data: StudioData;
  service: StudioService;
}

const Ctx = createContext<StudioValue | null>(null);

export function StudioProvider({ data, service, children }: StudioValue & { children: ReactNode }) {
  return <Ctx.Provider value={{ data, service }}>{children}</Ctx.Provider>;
}

/** The Studio's data and callables. Throws outside `StudioProvider`: a missing provider is a bug. */
export function useStudio(): StudioValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useStudio must be used inside <StudioProvider>');
  return value;
}
