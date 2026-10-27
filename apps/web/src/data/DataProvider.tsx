import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { LearnerData } from './types';

const Ctx = createContext<LearnerData | null>(null);

export function DataProvider({ data, children }: { data: LearnerData; children: ReactNode }) {
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

/** The learner data port. Throws outside `DataProvider`: a missing provider is a bug. */
export function useLearnerData(): LearnerData {
  const data = useContext(Ctx);
  if (!data) throw new Error('useLearnerData must be used inside <DataProvider>');
  return data;
}
