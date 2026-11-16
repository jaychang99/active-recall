'use client';
import { useEffect, useRef } from 'react';

/**
 * One set of controls: inline on desktop, above the visible viewport's bottom on mobile. `dock` also docks it on
 * desktop (lined up with the study column); `'slide'` makes it rise from the bottom edge as it appears.
 */
export function StudyActions({ children, dock }: { children: React.ReactNode; dock?: 'slide' | 'static' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = ref.current;
    const root = bar?.closest<HTMLElement>('[data-study-root]');
    if (!bar || !root) return;
    const viewport = window.visualViewport;
    const mobile = window.matchMedia('(max-width: 767px)');
    let frame = 0;
    let revealInput = false;
    let lastInset = -1;
    let lastHeight = -1;
    // Measure only when the bar itself changes size, not on every viewport scroll.
    const measure = () => {
      if (dock && !mobile.matches) {
        // Docked on desktop: span the study column, not the whole window (the sidebar stays clear).
        const r = root.getBoundingClientRect();
        bar.style.setProperty('--dock-left', `${Math.round(r.left)}px`);
        bar.style.setProperty('--dock-width', `${Math.round(r.width)}px`);
      } else {
        bar.style.removeProperty('--dock-left');
        bar.style.removeProperty('--dock-width');
      }
      if (!mobile.matches && !dock) {
        root.style.removeProperty('--study-actions-height');
        lastHeight = -1;
        return;
      }
      const height = Math.ceil(bar.getBoundingClientRect().height);
      if (height === lastHeight) return;
      lastHeight = height;
      root.style.setProperty('--study-actions-height', `${height}px`);
    };
    const update = (ensureVisible = false) => {
      revealInput ||= ensureVisible;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const shouldReveal = revealInput;
        revealInput = false;
        if (!mobile.matches) {
          bar.style.removeProperty('--keyboard-inset');
          delete bar.dataset.keyboard;
          lastInset = -1;
          return;
        }
        const active = document.activeElement;
        const editing = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) && root.contains(active);
        // Safari toolbar animations also resize/scroll visualViewport. Only a substantial
        // occlusion while editing is a keyboard; normal page scrolling must leave the bar alone.
        const occlusion = editing && viewport && Math.abs(viewport.scale - 1) < 0.01 ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        const inset = occlusion > 80 ? Math.round(occlusion) : 0;
        if (inset !== lastInset) {
          bar.style.setProperty('--keyboard-inset', `${inset}px`);
          bar.dataset.keyboard = String(inset > 0);
          lastInset = inset;
        }
        // Never fight the user's scroll by scrolling the focused field back into view.
        if (!shouldReveal || !editing || !inset) return;
        const height = bar.getBoundingClientRect().height;
        const rect = active.getBoundingClientRect();
        const top = (viewport?.offsetTop ?? 0) + 12;
        const bottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - height - 12;
        // Let the browser handle caret scrolling inside a textarea taller than the available space.
        if (rect.height > bottom - top) return;
        if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' });
        else if (rect.top < top) window.scrollBy({ top: rect.top - top, behavior: 'instant' });
      });
    };
    const onResize = () => { measure(); update(true); };
    const onScroll = () => {
      if (bar.dataset.keyboard === 'true') update();
    };
    const onFocus = () => update(true);
    const onBlur = () => update();
    const observer = new ResizeObserver(() => { lastHeight = -1; measure(); });
    observer.observe(bar);
    observer.observe(root);
    viewport?.addEventListener('resize', onResize);
    viewport?.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onResize);
    mobile.addEventListener('change', onResize);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('focusout', onBlur);
    measure();
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport?.removeEventListener('resize', onResize);
      viewport?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      mobile.removeEventListener('change', onResize);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('focusout', onBlur);
      root.style.removeProperty('--study-actions-height');
    };
  }, [dock]);
  return <div ref={ref} className="study-actions" data-dock={dock} data-testid="study-actions"><div className="mx-auto w-full max-w-[840px]">{children}</div></div>;
}
