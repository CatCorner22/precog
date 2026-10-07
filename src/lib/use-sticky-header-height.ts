import { useEffect, type RefObject } from "react";

/**
 * Publishes the sticky home header's height as `--home-header-h` on <html>,
 * so the page's one scroll offset (`scroll-padding-top` in styles.css) clears
 * the header at every width: on a phone the header wraps to two rows above
 * the tab strip, and a fixed offset would leave a section's heading under it.
 */
export function useStickyHeaderHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--home-header-h", `${header.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--home-header-h");
    };
  }, [ref]);
}
