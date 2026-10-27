import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ConsoleData, ConsoleService } from './types';

interface ConsoleValue {
  data: ConsoleData;
  service: ConsoleService;
}

const Ctx = createContext<ConsoleValue | null>(null);

export function ConsoleProvider({
  data,
  service,
  children,
}: ConsoleValue & { children: ReactNode }) {
  return <Ctx.Provider value={{ data, service }}>{children}</Ctx.Provider>;
}

/** The console's reads and callables. Throws outside `ConsoleProvider`: a missing provider is a bug. */
export function useConsole(): ConsoleValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useConsole must be used inside <ConsoleProvider>');
  return value;
}
