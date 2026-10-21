import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { startActivity } from '@/lib/request-activity';
import { RequestFeedback } from './request-feedback';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('avoids short-request flicker, explains long waits, and clears when the last request finishes', () => {
  vi.useFakeTimers();
  render(<RequestFeedback />);
  let finish!: () => void;
  act(() => { finish = startActivity('write'); });
  expect(screen.queryByTestId('request-feedback')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByText('서버에서 처리 중…')).toBeVisible();
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  act(() => vi.advanceTimersByTime(5_700));
  expect(screen.getByText(/서버 응답을 기다리고 있습니다/)).toBeVisible();
  act(() => finish());
  expect(screen.queryByTestId('request-feedback')).not.toBeInTheDocument();
});
