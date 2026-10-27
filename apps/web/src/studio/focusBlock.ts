/**
 * Moves focus into the first field of the block with this id. Returns null once it has focused, or
 * the id again when the block is not in the page yet, so the caller tries after its next render
 * instead of failing when a render lands before the new block does.
 */
export function focusBlock(id: string): string | null {
  const field = document.querySelector<HTMLElement>(
    `[data-block-id="${id}"] :is(textarea, input, select)`,
  );
  if (!field) return id;
  field.focus();
  return null;
}
