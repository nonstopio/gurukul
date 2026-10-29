import axe from 'axe-core';

/**
 * Runs axe-core over a rendered tree and returns its violations as readable lines.
 * `color-contrast` is off because jsdom does no layout or painting; contrast is checked against
 * the tokens instead (see the gurukul-design skill). Iframes are skipped: jsdom cannot message
 * into a frame, so axe would hang on them; the frame's own `title` is asserted in the tests.
 */
export async function axeViolations(root: Element): Promise<string[]> {
  const results = await axe.run(
    { include: [root], exclude: [['iframe']] },
    { rules: { 'color-contrast': { enabled: false } } },
  );
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
}
