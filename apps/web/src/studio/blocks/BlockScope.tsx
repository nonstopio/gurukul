import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** Who is editing which course: what an upload needs to name and label its file. */
export interface BlockScopeValue {
  courseId: string;
  uid: string;
}

const Ctx = createContext<BlockScopeValue | null>(null);

export function BlockScope({ courseId, uid, children }: BlockScopeValue & { children: ReactNode }) {
  return <Ctx.Provider value={{ courseId, uid }}>{children}</Ctx.Provider>;
}

/** The course and person a block editor works for. Throws outside `BlockScope`: a missing provider is a bug. */
export function useBlockScope(): BlockScopeValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useBlockScope must be used inside <BlockScope>');
  return value;
}
