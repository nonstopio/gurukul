import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ParikshaService } from './service';

const Ctx = createContext<ParikshaService | null>(null);

export function ParikshaProvider({
  service,
  children,
}: {
  service: ParikshaService;
  children: ReactNode;
}) {
  return <Ctx.Provider value={service}>{children}</Ctx.Provider>;
}

/** The grading service. Throws outside `ParikshaProvider`: a missing provider is a bug. */
export function useParikshaService(): ParikshaService {
  const service = useContext(Ctx);
  if (!service) throw new Error('useParikshaService must be used inside <ParikshaProvider>');
  return service;
}
