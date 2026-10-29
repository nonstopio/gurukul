/**
 * A new stable id for a chapter, lesson, block, question or option: 8 random hex characters, lower
 * case, unique enough within one course. Ids never change once created: learner progress points at
 * them. `random` is injectable so tests are deterministic.
 */
export function newId(prefix: string, random: () => number = Math.random): string {
  const hex = Array.from({ length: 8 }, () => Math.floor(random() * 16).toString(16)).join('');
  return `${prefix}-${hex}`;
}
