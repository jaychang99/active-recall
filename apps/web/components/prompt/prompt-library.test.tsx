import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { resolvePromptOptions } from '@/lib/prompt-options';
import { PromptLibrary } from './prompt-library';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); });
const options = resolvePromptOptions({ sourceMode: 'general_knowledge', mainTopic: '자료구조', subtopics: ['트리'], outputLanguage: 'fr', numberOfQuestions: 51, difficulty: { easy: 5, medium: 25, hard: 70 }, allowExtendedTypes: false });
const history = { id: 'h1', kind: 'history', copyKind: 'bundle', name: '이전 설정', optionsJson: options, createdAt: '2026-10-22T00:00:00Z' };
const current = resolvePromptOptions(null);

function mount(onLoad = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><PromptLibrary value={current} onLoad={onLoad} loaded /></QueryClientProvider>);
  return onLoad;
}

it('loads a separate full snapshot, and saving history as a preset does not use the current form', async () => {
  vi.mocked(api).mockImplementation(async (_path, request) => request?.method === 'POST' ? {} : { items: [history], nextOffset: null });
  const onLoad = mount();
  fireEvent.click(await screen.findByTestId('prompt-snapshot-load'));
  expect(onLoad).toHaveBeenCalledWith(options);
  expect(onLoad.mock.calls[0]![0].difficulty).not.toBe(options.difficulty);
  fireEvent.click(screen.getByRole('button', { name: /^프리셋으로 저장$/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('프리셋 이름'), { target: { value: '시험용' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^저장$/ }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/prompt-library', { method: 'POST', json: { kind: 'preset', name: '시험용', options } }));
  expect(api).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ json: expect.objectContaining({ kind: 'history' }) }));
});

it('saves current settings without copying, and deleting history leaves presets alone', async () => {
  vi.mocked(api).mockImplementation(async (path, request) => request?.method ? {} : { items: path.includes('kind=history') ? [history] : [], nextOffset: null });
  mount();
  await screen.findByTestId('prompt-snapshot');
  fireEvent.click(screen.getByTestId('prompt-save-preset'));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('프리셋 이름'), { target: { value: '독립 프리셋' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^저장$/ }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/prompt-library', { method: 'POST', json: { kind: 'preset', name: '독립 프리셋', options: current } }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '이전 설정 삭제' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/prompt-library/h1', { method: 'DELETE' }));
});
