/** True when focus is somewhere a single-letter shortcut would be typed into. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true);
}
