'use client';
import { RotateCcw } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { Deck } from '@/lib/api';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CORE_TYPES, COVERAGES, EXPLANATION_DEPTHS, LANGUAGE_PRESETS, LIMITS, MATH_NOTATIONS, PROMPT_DEFAULTS, SOURCE_LOCATORS, SOURCE_MODES, TYPE_LABEL_KO, changedKeys, sumDifficulty, sumTypeTarget, type PromptOptions } from '@/lib/prompt-options';
import { cn } from '@/lib/utils';

const SOURCE_MODE_KO: Record<(typeof SOURCE_MODES)[number], string> = { provided_materials: '첨부 자료만', general_knowledge: '일반 지식 허용' };
const COVERAGE_KO: Record<(typeof COVERAGES)[number], string> = { balanced_across_topics: '범위 전체를 균등하게', follow_material_order: '자료 순서대로' };
const DEPTH_KO: Record<(typeof EXPLANATION_DEPTHS)[number], string> = { brief: '간략', standard: '보통', detailed: '상세' };
const MATH_KO: Record<(typeof MATH_NOTATIONS)[number], string> = { latex: 'LaTeX ($…$, KaTeX)', plain: '일반 텍스트' };
const LOCATOR_KO: Record<(typeof SOURCE_LOCATORS)[number], string> = { always: '항상', only_if_verifiable: '확인 가능할 때만', never: '넣지 않음' };
const LANG_KO: Record<(typeof LANGUAGE_PRESETS)[number], string> = { auto: '자동 (자료의 주 언어)', ko: '한국어 (ko)', en: 'English (en)', ja: '日本語 (ja)', zh: '中文 (zh)' };

/** One field row: label (+ hint) on the left, control on the right. When the value differs from the base, a per-field reset button appears beside the label. */
function Row({ label, hint, changed, onReset, htmlFor, children }: { label: string; hint?: string; changed?: boolean; onReset?: () => void; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={htmlFor}>{label}</Label>
          {changed ? (
            <button type="button" onClick={onReset} aria-label={`${label} 기본값으로 되돌리기`} data-testid="prompt-field-reset" className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/40 bg-accent-soft px-1.5 text-[11px] font-medium text-accent-soft-ink hover:brightness-105">
              <RotateCcw className="h-3 w-3" /> 기본값으로
            </button>
          ) : null}
        </div>
        {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Slider + number pair sharing one value. The number input is the accessible control; the slider is the fast one. */
function NumberRange({ id, value, min, max, step = 1, unit, onChange }: { id: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n / step) * step : min));
  return (
    <div className="flex items-center gap-3">
      <input type="range" aria-hidden tabIndex={-1} min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-1">
        <Input id={id} type="number" inputMode="numeric" min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="w-20 text-right tabular" />
        {unit ? <span className="text-[12px] text-ink-3">{unit}</span> : null}
      </div>
    </div>
  );
}

function PercentInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-2 text-[13px]">
      <span className="truncate text-ink-2">{label}</span>
      <span className="flex shrink-0 items-center gap-1"><Input id={id} type="number" inputMode="numeric" min={0} max={100} value={value} onChange={(e) => onChange(Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))))} className="h-8 w-16 text-right tabular" aria-label={`${label} 비율`} /><span className="text-[12px] text-ink-3">%</span></span>
    </label>
  );
}

function SumBadge({ sum }: { sum: number }) {
  return sum === 100 ? <Badge tone="ok">합계 100%</Badge> : <Badge tone="warn">합계 {sum}% · 100%가 되어야 합니다</Badge>;
}

export interface PromptOptionsFormProps {
  value: PromptOptions;
  onChange: (next: PromptOptions) => void;
  /** Reference values (saved defaults on /prompt, the prompt document in Settings). Fields that differ get a per-field reset button. */
  base?: PromptOptions;
  /** Decks offered by the "덱에서 채우기" picker. */
  decks?: Pick<Deck, 'id' | 'title' | 'subject'>[];
  /** Hide the deck identity section (Settings: defaults rarely carry a specific deck). */
  hideDeck?: boolean;
}

/** Every CONFIG option of the generator prompt as a form. Used on /prompt (one-off copy) and in Settings (defaults). */
export function PromptOptionsForm({ value: o, onChange, base = PROMPT_DEFAULTS, decks, hideDeck }: PromptOptionsFormProps) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const set = <K extends keyof PromptOptions>(k: K, v: PromptOptions[K]) => onChange({ ...o, [k]: v });
  const changed = useMemo(() => new Set(changedKeys(o, base)), [o, base]);
  const isChanged = (k: keyof PromptOptions) => changed.has(k);
  /** Props shared by every Row: the changed mark and the reset to the base value for that one key. */
  const row = (k: keyof PromptOptions) => ({ changed: isChanged(k), onReset: () => { const v = base[k]; onChange({ ...o, [k]: typeof v === 'object' && v !== null ? { ...(v as object) } : v }); if (k === 'outputLanguage') setCustomLang(!(LANGUAGE_PRESETS as readonly string[]).includes(base.outputLanguage)); } });
  const [customLang, setCustomLang] = useState(() => !(LANGUAGE_PRESETS as readonly string[]).includes(o.outputLanguage));
  const diffSum = sumDifficulty(o);
  const typeSum = sumTypeTarget(o);

  return (
    <div className="space-y-6">
      {!hideDeck ? (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-ink-2">덱</h3>
          <Row label="덱 ID" hint="영문·숫자·밑줄. 같은 ID로 다시 가져오면 기존 덱이 갱신됩니다." {...row('deckId')} htmlFor={id('deckId')}>
            <div className="flex gap-2">
              <Input id={id('deckId')} value={o.deckId} onChange={(e) => set('deckId', e.target.value)} className="font-mono text-[13px]" spellCheck={false} />
              {decks?.length ? (
                <Select aria-label="기존 덱에서 채우기" value="" onChange={(e) => { const d = decks.find((x) => x.id === e.target.value); if (d) onChange({ ...o, deckId: d.id, deckTitle: d.title, subject: d.subject }); }} className="w-32 shrink-0">
                  <option value="">기존 덱…</option>
                  {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </Select>
              ) : null}
            </div>
          </Row>
          <Row label="덱 제목" {...row('deckTitle')} htmlFor={id('deckTitle')}><Input id={id('deckTitle')} value={o.deckTitle} onChange={(e) => set('deckTitle', e.target.value)} /></Row>
          <Row label="과목" hint="가져올 때 덱 과목으로 자동 부여됩니다." {...row('subject')} htmlFor={id('subject')}><Input id={id('subject')} value={o.subject} onChange={(e) => set('subject', e.target.value)} /></Row>
        </section>
      ) : null}

      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-ink-2">출력</h3>
        <Row label="문항 수" hint={`${LIMITS.numberOfQuestions.min}–${LIMITS.numberOfQuestions.max}. 한 번에 1,000문항까지 가져올 수 있습니다.`} {...row('numberOfQuestions')} htmlFor={id('n')}>
          <NumberRange id={id('n')} value={o.numberOfQuestions} min={LIMITS.numberOfQuestions.min} max={LIMITS.numberOfQuestions.max} unit="문항" onChange={(v) => set('numberOfQuestions', v)} />
        </Row>
        <Row label="출력 언어" hint="자동이면 첨부 자료의 주 언어를 따릅니다. BCP-47 코드를 직접 입력할 수도 있습니다." {...row('outputLanguage')} htmlFor={id('lang')}>
          <div className="flex gap-2">
            <Select id={id('lang')} className="min-w-0 flex-1" value={customLang ? '__custom' : o.outputLanguage} onChange={(e) => { if (e.target.value === '__custom') { setCustomLang(true); } else { setCustomLang(false); set('outputLanguage', e.target.value); } }}>
              {LANGUAGE_PRESETS.map((l) => <option key={l} value={l}>{LANG_KO[l]}</option>)}
              <option value="__custom">직접 입력…</option>
            </Select>
            {customLang ? <Input aria-label="언어 코드" value={o.outputLanguage} onChange={(e) => set('outputLanguage', e.target.value.trim() || 'auto')} placeholder="de, fr, es…" className="w-24 shrink-0 font-mono text-[13px]" /> : null}
          </div>
        </Row>
        <Row label="객관식 선지 수" {...row('mcqChoiceCount')} htmlFor={id('mcq')}>
          <NumberRange id={id('mcq')} value={o.mcqChoiceCount} min={LIMITS.mcqChoiceCount.min} max={LIMITS.mcqChoiceCount.max} unit="개" onChange={(v) => set('mcqChoiceCount', v)} />
        </Row>
        <Row label="해설 깊이" {...row('explanationDepth')} htmlFor={id('depth')}>
          <Select id={id('depth')} className="w-full" value={o.explanationDepth} onChange={(e) => set('explanationDepth', e.target.value as PromptOptions['explanationDepth'])}>{EXPLANATION_DEPTHS.map((d) => <option key={d} value={d}>{DEPTH_KO[d]}</option>)}</Select>
        </Row>
        <Row label="수식 표기" {...row('mathNotation')} htmlFor={id('math')}>
          <Select id={id('math')} className="w-full" value={o.mathNotation} onChange={(e) => set('mathNotation', e.target.value as PromptOptions['mathNotation'])}>{MATH_NOTATIONS.map((m) => <option key={m} value={m}>{MATH_KO[m]}</option>)}</Select>
        </Row>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-ink-2">자료</h3>
        <Row label="출제 범위" {...row('sourceMode')} htmlFor={id('src')}>
          <Select id={id('src')} className="w-full" value={o.sourceMode} onChange={(e) => set('sourceMode', e.target.value as PromptOptions['sourceMode'])}>{SOURCE_MODES.map((m) => <option key={m} value={m}>{SOURCE_MODE_KO[m]}</option>)}</Select>
        </Row>
        <Row label="범위 배분" {...row('coverage')} htmlFor={id('cov')}>
          <Select id={id('cov')} className="w-full" value={o.coverage} onChange={(e) => set('coverage', e.target.value as PromptOptions['coverage'])}>{COVERAGES.map((c) => <option key={c} value={c}>{COVERAGE_KO[c]}</option>)}</Select>
        </Row>
        <Row label="자료 밖 정보 허용" hint="끄면 첨부 자료에 없는 사실은 출제하지 않습니다." {...row('allowOutOfScopeInformation')} htmlFor={id('oos')}>
          <Switch id={id('oos')} checked={o.allowOutOfScopeInformation} onCheckedChange={(v) => set('allowOutOfScopeInformation', v)} />
        </Row>
        <Row label="출처 위치 표기" hint="문항마다 자료의 페이지·슬라이드 등을 기록합니다." {...row('includeSourceLocators')} htmlFor={id('loc')}>
          <Select id={id('loc')} className="w-full" value={o.includeSourceLocators} onChange={(e) => set('includeSourceLocators', e.target.value as PromptOptions['includeSourceLocators'])}>{SOURCE_LOCATORS.map((l) => <option key={l} value={l}>{LOCATOR_KO[l]}</option>)}</Select>
        </Row>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-ink-2">문항 구성</h3>
        <Row label="난이도 분포" hint="세 값의 합이 100%여야 합니다." {...row('difficulty')}>
          <div className="space-y-1.5">
            {(['easy', 'medium', 'hard'] as const).map((k) => (
              <div key={k} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-[13px]">
                <span className="text-ink-2">{{ easy: '쉬움', medium: '보통', hard: '어려움' }[k]}</span>
                <input type="range" aria-label={`${k} 비율`} min={0} max={100} value={o.difficulty[k]} onChange={(e) => set('difficulty', { ...o.difficulty, [k]: Number(e.target.value) })} />
                <span className="w-10 text-right tabular">{o.difficulty[k]}%</span>
              </div>
            ))}
            <div className="pt-1"><SumBadge sum={diffSum} /></div>
          </div>
        </Row>
        <Row label="유형별 목표 비율" hint="핵심 8종의 목표 비율. 합이 100%여야 합니다." {...row('typeTarget')}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {CORE_TYPES.map((t) => <PercentInput key={t} id={id(`t-${t}`)} label={TYPE_LABEL_KO[t]} value={o.typeTarget[t]} onChange={(v) => set('typeTarget', { ...o.typeTarget, [t]: v })} />)}
            <div className="col-span-2 pt-1"><SumBadge sum={typeSum} /></div>
          </div>
        </Row>
        <Row label="핵심 8종 모두 포함" hint="문항이 8개 이상이면 각 유형을 최소 1개씩 만듭니다." {...row('requireAllEightTypes')} htmlFor={id('all8')}>
          <Switch id={id('all8')} checked={o.requireAllEightTypes} onCheckedChange={(v) => set('requireAllEightTypes', v)} />
        </Row>
        <Row label="확장 8종 허용" hint="숫자형·빈칸 선택·진술 판단·분류·답+근거·회상 카드·단계별·구간 선택. 내용에 맞을 때만 쓰입니다." {...row('allowExtendedTypes')} htmlFor={id('ext')}>
          <Switch id={id('ext')} checked={o.allowExtendedTypes} onCheckedChange={(v) => set('allowExtendedTypes', v)} />
        </Row>
      </section>
    </div>
  );
}

/** Small inline warning list for the preview panel. */
export function PromptOptionsWarnings({ value: o, className }: { value: PromptOptions; className?: string }) {
  const items: string[] = [];
  if (sumDifficulty(o) !== 100) items.push(`난이도 분포 합계가 ${sumDifficulty(o)}%입니다.`);
  if (sumTypeTarget(o) !== 100) items.push(`유형별 비율 합계가 ${sumTypeTarget(o)}%입니다.`);
  if (o.requireAllEightTypes && o.numberOfQuestions < CORE_TYPES.length) items.push(`문항 수가 ${o.numberOfQuestions}개라 8종을 모두 넣을 수 없습니다 (8개 미만이면 이 조건은 무시됩니다).`);
  if (!/^[a-z0-9_]+$/i.test(o.deckId)) items.push('덱 ID는 영문·숫자·밑줄만 쓸 수 있습니다.');
  if (!items.length) return null;
  return (
    <ul className={cn('space-y-1 text-[12px] text-warn-ink', className)} role="status">
      {items.map((t) => <li key={t}>· {t}</li>)}
    </ul>
  );
}
