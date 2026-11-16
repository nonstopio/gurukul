/**
 * A ref for the current item's link in a Studio outline rail. Below 64rem the rail's list is
 * capped in height (`studio.css`), so a lesson far down a long course would sit out of sight; this
 * scrolls the list, never the page, until the link is at its top. On a wide screen the list is not
 * capped and nothing moves.
 */
export function scrollIntoRail(link: HTMLElement | null) {
  const nav = link?.closest('nav');
  if (link && nav) {
    nav.scrollTop += link.getBoundingClientRect().top - nav.getBoundingClientRect().top;
  }
}
