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
/**
 * Waits until the page is still: no toast is leaving, and every finite animation has ended except a
 * toast's dismiss timer (`g-toast-timer`). Waiting for that timer, as this once did, meant axe ran just
 * as the toast began fading out, and read its title at part opacity as low contrast.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('.g-toast[data-leaving]'));
  // Two frames first: an animation that a render has just started only exists after the next frame.
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  // Entrance animations and the boot loader's fade pass through low opacity, which axe reads as low
  // contrast. Looping ones (the loader) never end.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .filter((a) => !(a instanceof CSSAnimation && a.animationName === 'g-toast-timer'))
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/**
 * Runs axe-core in the page (real layout, so colour contrast is checked, unlike in jsdom) and fails
 * on any serious or critical violation. The message names each rule and the elements it hit. A toast
 * on screen is checked fully visible; if one starts leaving during the run, the run is repeated once
 * it has gone, since part of that run saw it fading.
 */
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  await page.addScriptTag({ path: axePath });
  let violations: unknown[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await settle(page);
    const run = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: () => Promise<{ violations: unknown[] }> } })
        .axe;
      const toasts = [...document.querySelectorAll('.g-toast')];
      const result = await axe.run();
      const fading = toasts.some((t) => !t.isConnected || t.hasAttribute('data-leaving'));
      return { violations: result.violations, fading };
    });
    violations = run.violations;
    if (!run.fading) break;
  }
  const serious = (violations as AxeViolation[])
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.impact}: ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    );
  expect(serious, 'serious or critical accessibility violations').toEqual([]);
}
