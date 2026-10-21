'use client';
import { useEffect, useRef } from 'react';

/** One set of controls: inline on desktop, above the visible viewport's bottom on mobile. */
export function StudyActions({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = ref.current;
    const root = bar?.closest<HTMLElement>('[data-study-root]');
    if (!bar || !root) return;
    const viewport = window.visualViewport;
    const mobile = window.matchMedia('(max-width: 767px)');
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!mobile.matches) {
          root.style.removeProperty('--study-actions-height');
          bar.style.removeProperty('--keyboard-inset');
          return;
        }
        // Do not interpret pinch zoom as an on-screen keyboard.
        const inset = viewport && Math.abs(viewport.scale - 1) < 0.01 ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        bar.style.setProperty('--keyboard-inset', `${inset}px`);
        bar.dataset.keyboard = String(inset > 80);
        const height = bar.getBoundingClientRect().height;
        root.style.setProperty('--study-actions-height', `${height}px`);
        const active = document.activeElement;
        if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) || !root.contains(active)) return;
        const rect = active.getBoundingClientRect();
        const top = (viewport?.offsetTop ?? 0) + 12;
        const bottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - height - 12;
        // Let the browser handle caret scrolling inside a textarea taller than the available space.
        if (rect.height > bottom - top) return;
        if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' });
        else if (rect.top < top) window.scrollBy({ top: rect.top - top, behavior: 'instant' });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    root.addEventListener('focusin', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.removeEventListener('focusin', update);
      root.style.removeProperty('--study-actions-height');
    };
  }, []);
  return <div ref={ref} className="study-actions" data-testid="study-actions"><div className="mx-auto w-full max-w-[840px]">{children}</div></div>;
}
