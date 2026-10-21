'use client';
import NextLink, { useLinkStatus } from 'next/link';
import { forwardRef, useEffect, type ComponentProps } from 'react';
import { startActivity } from '@/lib/request-activity';

function NavigationActivity() {
  const { pending } = useLinkStatus();
  useEffect(() => { if (pending) return startActivity('navigation'); }, [pending]);
  return null;
}

const NavigationLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(({ children, ...props }, ref) => (
  <NextLink ref={ref} {...props}>{children}<NavigationActivity /></NextLink>
));
NavigationLink.displayName = 'NavigationLink';
export default NavigationLink;
