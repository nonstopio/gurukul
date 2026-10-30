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
  // Entrance animations and the boot loader's fade pass through low opacity, which axe reads as low
  // contrast. Wait for every finite animation to end; looping ones (the loader) never do.
  // Two frames first: an animation that a render has just started only exists after the next frame.
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
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
