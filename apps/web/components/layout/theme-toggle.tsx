'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <Tooltip content={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}>
      <Button variant="ghost" size="icon" aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'} aria-pressed={dark} data-testid="theme-toggle" onClick={() => setTheme(dark ? 'light' : 'dark')}>
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </Tooltip>
  );
}
