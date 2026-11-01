import { hints as createHints } from 'driver.js/hints';
import type { DriverHint } from 'driver.js/hints';
import 'driver.js/dist/hints.css';
import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router';
import { TIPS } from './registry';
import type { Tip } from './registry';
import { readTips, updateTips, useTipsSwitch } from './store';

const OPEN_DELAY_MS = 600;
const SETTLE_MS = 150;
/**
 * While one of these is open the page is not the person's focus: no dots, no bubble. Driver.js's own
 * bubble is a `role="dialog"` too, hence the `:not`. `.g-app-shell--open` is the sidebar drawer on a
 * phone, which makes the page inert.
 */
const BLOCKING =
  'dialog[open], [role="dialog"]:not(.driver-popover), [role="menu"], .g-app-shell--open';

/** On screen horizontally: a drawer that is closed sits just off the edge. */
function onScreen(node: Element) {
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.right > 0 && r.left < innerWidth;
}

function toHint({ id, title, text, side }: Tip, element: Element): DriverHint {
  return {
    id,
    element,
    // Inside the feature's top-right corner, not floating off it.
    beacon: { side: 'top', align: 'end', offsetX: -12, offsetY: 12 },
    popover: {
      title,
      description: `<span><b>Tip:</b> ${text.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</span>`,
      side: side ?? 'bottom',
      align: 'start',
      buttonText: 'Got it',
      popoverClass: 'g-tip',
    },
  };
}

/**
 * Puts a dot on each feature of this page that has a tip not yet dismissed, and opens the first
 * one by itself, once. "Got it" or using the feature dismisses a tip for good; Close, Escape or a
 * click elsewhere only closes the bubble and keeps the dot. Driver.js's hints module places it;
 * `store.ts` remembers, per person and browser. Mounted once, in `Frame`.
 */
export function useTips(uid: string, tips: readonly Tip[] = TIPS) {
  const { pathname } = useLocation();
  const { on } = useTipsSwitch(uid);

  useEffect(() => {
    if (!on) return;
    const h = createHints({
      overlay: false,
      onOpen: (_, hint) =>
        updateTips(uid, (s) => ({ ...s, opened: [...new Set([...s.opened, String(hint.id)])] })),
      onDismiss: (_, hint) =>
        updateTips(uid, (s) => ({ ...s, done: [...new Set([...s.done, String(hint.id)])] })),
    });
    let shown: [string, Element][] = [];
    let drawn = false;
    let settle = 0;
    let opener = 0;

    const sync = () => {
      clearTimeout(opener);
      const state = readTips(uid);
      if (!state || state.off || document.querySelector(BLOCKING)) {
        if (drawn) h.hide();
        drawn = false;
        shown = [];
        return;
      }
      const eligible = tips.flatMap((t): [Tip, Element][] => {
        if (state.done.includes(t.id) || !t.where.some((p) => matchPath(p, pathname))) return [];
        const node = document.querySelector(t.el);
        return node && onScreen(node) ? [[t, node]] : [];
      });
      const changed =
        eligible.length !== shown.length ||
        eligible.some(([t, n], i) => shown[i]?.[0] !== t.id || shown[i]?.[1] !== n);
      if (changed || !drawn) {
        // Setting hints closes the open bubble; one the reader is reading comes back.
        const reading = h.getActive()?.id;
        shown = eligible.map(([t, n]) => [t.id, n]);
        h.setHints(eligible.map(([t, n]) => toHint(t, n)));
        h.show();
        drawn = true;
        if (reading !== undefined && eligible.some(([t]) => t.id === reading)) h.open(reading);
      }
      // Only the page's first tip opens by itself, and only once; the rest stay dots.
      const first = eligible[0];
      if (!first || state.opened.includes(first[0].id)) return;
      opener = window.setTimeout(() => {
        if (h.getActive() || !first[1].isConnected || !onScreen(first[1])) return;
        // Opening moves focus into the bubble; an automatic one gives it back.
        const was = document.activeElement as HTMLElement | null;
        h.open(first[0].id);
        was?.focus({ preventScroll: true });
      }, OPEN_DELAY_MS);
    };

    // Pages load lazily and fill in later; look again once the DOM stops changing.
    const schedule = () => {
      clearTimeout(settle);
      settle = window.setTimeout(sync, SETTLE_MS);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    // Using the feature is proof the tip worked.
    const used = (e: MouseEvent) => {
      for (const [id, node] of shown) if (node.contains(e.target as Node)) h.dismiss(id);
    };
    document.addEventListener('click', used, true);
    schedule();

    return () => {
      clearTimeout(settle);
      clearTimeout(opener);
      observer.disconnect();
      document.removeEventListener('click', used, true);
      h.setHints([]);
      h.hide();
    };
  }, [uid, on, pathname, tips]);
}
