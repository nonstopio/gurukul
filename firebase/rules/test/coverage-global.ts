import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export const COVERAGE_DIR = resolve(import.meta.dirname, '../coverage');
export const MUTANT_DIR = resolve(import.meta.dirname, '../coverage-storage');

// Empties the per-file rules coverage reports and the Storage mutant results before a run, so the gate never merges a report
// taken against an older firestore.rules.
export default function setup() {
  for (const dir of [COVERAGE_DIR, MUTANT_DIR]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
}
