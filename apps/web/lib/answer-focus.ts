/** Touch users open the keyboard deliberately; desktop keeps its keyboard-first workflow. */
export function focusAnswerInput(element: HTMLElement | null | undefined) {
  if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  element?.focus({ preventScroll: true });
}

export function dismissAnswerKeyboard() {
  if (typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) active.blur();
}
