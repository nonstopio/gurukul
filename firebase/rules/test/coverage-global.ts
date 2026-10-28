import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export const COVERAGE_DIR = resolve(import.meta.dirname, '../coverage');

// Empties the per-file rules coverage reports before a run, so the gate never merges a report
// taken against an older firestore.rules.
export default function setup() {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });
  mkdirSync(COVERAGE_DIR, { recursive: true });
}
