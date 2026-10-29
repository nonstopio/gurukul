import { useLabelSet } from '../auth/AuthProvider';
import { terms } from './terms';
import type { Terms } from './terms';

const SETS = { generic: terms('generic'), gurukul: terms('gurukul') };

/** The names to render with, from the person's label set (generic until they pick). */
export function useTerms(): Terms {
  return SETS[useLabelSet()];
}
