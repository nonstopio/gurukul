/**
 * Moves focus into the first field of the block with this id: a text field, or the selected tab of
 * a block that has tabs (the Image block's Upload or Link). Fields that cannot take focus (a
 * hidden file input, a field in a tab that is not showing) are skipped. Returns null once it has
 * focused, or the id again when the block is not in the page yet, so the caller tries after its
 * next render instead of failing when a render lands before the new block does.
 */
export function focusBlock(id: string): string | null {
  const fields = document.querySelectorAll<HTMLElement>(
    `[data-block-id="${id}"] :is(textarea, input, select, [role="tab"][aria-selected="true"])`,
  );
  for (const field of fields) {
    field.focus();
    if (document.activeElement === field) return null;
  }
  return fields.length === 0 ? id : null;
}
