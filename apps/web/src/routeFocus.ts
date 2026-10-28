/**
 * Where keyboard and screen-reader users land on a page: its `h1`, else its `<main>`. Made
 * focusable without joining the Tab order. Null while the page has rendered neither.
 */
export function pageStart(root: ParentNode): HTMLElement | null {
  const target =
    root.querySelector<HTMLElement>('main h1') ?? root.querySelector<HTMLElement>('main');
  if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  return target;
}

/**
 * After a route change, focuses the new page's `h1` once it renders (data pages render it after
 * their load) and reports its text for the live region. Leaves focus alone if the person has
 * already moved it. Returns a function that stops waiting.
 */
export function focusPageOnArrival(
  root: HTMLElement,
  announce: (title: string) => void,
): () => void {
  const from = document.activeElement;
  const settle = (): boolean => {
    const h1 = root.querySelector<HTMLElement>('main h1');
    if (!h1) return false;
    const active = document.activeElement;
    if (active === from || active === document.body) pageStart(root)?.focus();
    announce(h1.textContent);
    return true;
  };
  if (settle()) return () => undefined;
  const observer = new MutationObserver(() => {
    if (settle()) observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
