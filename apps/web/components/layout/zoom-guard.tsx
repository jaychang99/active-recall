'use client';
import { useEffect } from 'react';

/** Safari can ignore viewport zoom limits; cancel its native pinch gesture too. */
export function ZoomGuard() {
  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault();
    const preventPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const options = { passive: false };
    document.addEventListener('gesturestart', preventGesture, options);
    document.addEventListener('gesturechange', preventGesture, options);
    document.addEventListener('touchmove', preventPinch, options);
    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('touchmove', preventPinch);
    };
  }, []);
  return null;
}
