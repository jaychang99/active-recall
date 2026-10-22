import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ZoomGuard } from './zoom-guard';

describe('ZoomGuard', () => {
  it('cancels native pinch gestures, permits single-finger scrolling and cleans up', () => {
    const { unmount } = render(<ZoomGuard />);
    for (const type of ['gesturestart', 'gesturechange']) {
      const event = new Event(type, { cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    for (const count of [1, 2]) {
      const event = new Event('touchmove', { cancelable: true });
      Object.defineProperty(event, 'touches', { value: Array(count).fill({}) });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(count > 1);
    }
    unmount();
    const event = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
