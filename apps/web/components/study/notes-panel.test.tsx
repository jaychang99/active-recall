import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesPanel } from './notes-panel';

// In-memory notes API: PUTs are recorded (optionally held open) and GETs return the last stored body.
const server = { body: null as string | null, puts: [] as string[], hold: null as null | (() => void) };
vi.mock('@/lib/api', () => ({
  api: vi.fn(async (url: string, init?: { method?: string; json?: { body: string } }) => {
    if (init?.method === 'PUT') {
      const body = init.json!.body;
      server.puts.push(body);
      if (server.hold) await new Promise<void>((r) => { server.hold = r; });
      server.body = body;
      return { id: 'n1', questionId: 'q1', reviewRound: 1, body, updatedAt: new Date().toISOString(), review: null };
    }
    return { notes: server.body === null ? [] : [{ id: 'n1', questionId: 'q1', reviewRound: 1, body: server.body, updatedAt: new Date().toISOString(), review: null }] };
  }),
}));

const sleep = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={qc}><NotesPanel questionId="q1" round={1} /></QueryClientProvider>);
  return { ...utils, ta: screen.getByTestId('note-input') as HTMLTextAreaElement };
}

describe('NotesPanel autosave', () => {
  beforeEach(() => { server.body = null; server.puts = []; server.hold = null; });

  it('never saves while an IME syllable is being composed, then saves the finished text once', async () => {
    const { ta } = setup();
    await sleep(30); // initial notes GET resolved
    ta.focus();
    fireEvent.compositionStart(ta);
    for (const v of ['ㅎ', '하', '한', '한ㄱ', '한그', '한글']) fireEvent.change(ta, { target: { value: v } });
    await sleep(1100);
    expect(server.puts).toEqual([]);
    fireEvent.compositionEnd(ta);
    await sleep(1100);
    expect(server.puts).toEqual(['한글']);
    expect(ta.value).toBe('한글');
  });

  it('a save that lands while the user keeps typing does not overwrite the newer text', async () => {
    const { ta } = setup();
    await sleep(30); // initial notes GET resolved
    ta.focus();
    fireEvent.change(ta, { target: { value: '메모' } });
    server.hold = () => {};
    await sleep(1000); // debounce fires, PUT('메모') is now in flight
    expect(server.puts).toEqual(['메모']);
    fireEvent.change(ta, { target: { value: '메모 추가' } });
    const release = server.hold!;
    server.hold = null;
    await act(async () => { release(); });
    await sleep(100); // refetch returns the older '메모'
    expect(ta.value).toBe('메모 추가');
    await sleep(1000);
    expect(server.puts).toEqual(['메모', '메모 추가']);
    expect(ta.value).toBe('메모 추가');
  });

  it('flushes unsaved text when the panel unmounts before the debounce fires', async () => {
    const { ta, unmount } = setup();
    await waitFor(() => expect(ta.value).toBe(''));
    fireEvent.change(ta, { target: { value: '다음 카드로' } });
    unmount();
    await sleep(10);
    expect(server.puts).toEqual(['다음 카드로']);
  });
});
