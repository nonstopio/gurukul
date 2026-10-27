import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';

const axePath = createRequire(import.meta.url).resolve('axe-core');

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: Array<{ target: unknown[] }>;
}

/**
 * Runs axe-core in the page (real layout, so colour contrast is checked, unlike in jsdom) and fails
 * on any serious or critical violation. The message names each rule and the elements it hit.
 */
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: () => Promise<{ violations: unknown[] }> } })
      .axe;
    return (await axe.run()).violations;
  });
  const serious = (violations as AxeViolation[])
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.impact}: ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    );
  expect(serious, 'serious or critical accessibility violations').toEqual([]);
}
