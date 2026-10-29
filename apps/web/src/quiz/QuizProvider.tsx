import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { QuizService } from './service';

const Ctx = createContext<QuizService | null>(null);

export function QuizProvider({ service, children }: { service: QuizService; children: ReactNode }) {
  return <Ctx.Provider value={service}>{children}</Ctx.Provider>;
}

/** The grading service. Throws outside `QuizProvider`: a missing provider is a bug. */
export function useQuizService(): QuizService {
  const service = useContext(Ctx);
  if (!service) throw new Error('useQuizService must be used inside <QuizProvider>');
  return service;
}
