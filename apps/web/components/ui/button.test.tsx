import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Button } from './button';
import { ProgressBar } from './loading';

afterEach(cleanup);

it('announces processing, blocks repeated clicks, and restores the button after completion', () => {
  const click = vi.fn();
  const { rerender } = render(<Button loading loadingLabel="저장 중…" onClick={click}>저장</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(screen.getByRole('button'));
  expect(click).not.toHaveBeenCalled();
  rerender(<Button onClick={click}>저장</Button>);
  fireEvent.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledOnce();
  expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
});

it('exposes a percentage only when work has a measured amount', () => {
  const { rerender } = render(<ProgressBar />);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  rerender(<ProgressBar value={50} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
});
