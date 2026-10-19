'use client';
import { RotateCcw } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { Deck } from '@/lib/api';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CORE_TYPES, COVERAGES, EXPLANATION_DEPTHS, LANGUAGE_PRESETS, LIMITS, MATH_NOTATIONS, PROMPT_DEFAULTS, SOURCE_LOCATORS, SOURCE_MODES, TYPE_LABEL_KO, changedKeys, parseSubtopics, rebalancePercentages, sumDifficulty, sumTypeTarget, type PromptOptions } from '@/lib/prompt-options';
import { cn } from '@/lib/utils';

const SOURCE_MODE_KO: Record<(typeof SOURCE_MODES)[number], string> = { provided_materials: '제공된 자료 모드', general_knowledge: '일반 지식 모드' };
const SOURCE_MODE_HINT: Record<(typeof SOURCE_MODES)[number], string> = { provided_materials: '복사한 프롬프트와 함께 PDF·교안·본문을 첨부하면 그 자료만으로 출제합니다.', general_knowledge: '자료 없이 아래 대주제·소주제에 대한 일반 지식으로 출제합니다.' };
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

/** One share of a distribution: slider + number. Changing it rebalances the other shares proportionally (always sums to 100). */
function ShareRow({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
      <label htmlFor={id} className="truncate text-ink-2">{label}</label>
      <input type="range" aria-hidden tabIndex={-1} min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0" />
      <span className="flex shrink-0 items-center gap-1"><Input id={id} type="number" inputMode="numeric" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-16 text-right tabular" aria-label={`${label} 비율`} /><span className="text-[12px] text-ink-3">%</span></span>
    </div>
  );
}

function SumBadge({ sum }: { sum: number }) {
  return sum === 100 ? <Badge tone="ok">합계 100%</Badge> : <Badge tone="warn">합계 {sum}% · 항목을 움직이면 100%로 맞춰집니다</Badge>;
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
  /** Show the per-copy fields (topics, audience) that are never saved as defaults. */
  oneOff?: boolean;
}

/** Every CONFIG option of the generator prompt as a form. Used on /prompt (one-off copy) and in Settings (defaults). */
export function PromptOptionsForm({ value: o, onChange, base = PROMPT_DEFAULTS, decks, hideDeck, oneOff }: PromptOptionsFormProps) {
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
  const general = o.sourceMode === 'general_knowledge';
  const [subtopicsText, setSubtopicsText] = useState(() => o.subtopics.join('\n'));
  // keep the textarea in sync when the value is replaced from outside (reset, defaults arriving)
  const joined = o.subtopics.join('\n');
  const [lastJoined, setLastJoined] = useState(joined);
  if (joined !== lastJoined) { setLastJoined(joined); if (parseSubtopics(subtopicsText).join('\n') !== joined) setSubtopicsText(joined); }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-ink-2">출제 모드</h3>
        <Row label="자료" hint={SOURCE_MODE_HINT[o.sourceMode]} {...row('sourceMode')}>
          <div role="radiogroup" aria-label="출제 모드" className="grid grid-cols-2 gap-1 rounded-md border border-line bg-sunken p-1" data-testid="prompt-source-mode">
            {SOURCE_MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={o.sourceMode === m} data-mode={m} onClick={() => set('sourceMode', m)} className={cn('h-8 rounded px-2 text-[13px] font-medium transition-colors', o.sourceMode === m ? 'bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-2 hover:text-ink')}>
                {SOURCE_MODE_KO[m]}
              </button>
            ))}
          </div>
        </Row>
        {general && oneOff ? (
          <>
            <Row label="대주제" hint="예: 운영체제, 컴퓨터네트워크 전송 계층. 덱 ID·제목·과목이 auto면 여기서 정해집니다." {...row('mainTopic')} htmlFor={id('topic')}>
              <Input id={id('topic')} value={o.mainTopic} onChange={(e) => set('mainTopic', e.target.value)} placeholder="대주제" data-testid="prompt-main-topic" />
            </Row>
            <Row label="소주제" hint="줄마다 하나. 문항을 소주제별로 고르게 배분하고 각 문항의 태그로 붙습니다. 비우면 대주제 전체." {...row('subtopics')} htmlFor={id('subtopics')}>
              <Textarea id={id('subtopics')} rows={4} value={subtopicsText} onChange={(e) => { setSubtopicsText(e.target.value); const next = parseSubtopics(e.target.value); setLastJoined(next.join('\n')); set('subtopics', next); }} placeholder={'프로세스 스케줄링\n교착 상태\n가상 메모리'} data-testid="prompt-subtopics" />
            </Row>
            <Row label="대상 학습자·수준" hint="선택. 난이도·용어·전제 지식의 기준이 됩니다." {...row('audienceLevel')} htmlFor={id('audience')}>
              <Input id={id('audience')} value={o.audienceLevel} onChange={(e) => set('audienceLevel', e.target.value)} placeholder="예: 학부 2학년 운영체제 수강생" data-testid="prompt-audience" />
            </Row>
          </>
        ) : null}
      </section>

      {!hideDeck ? (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-ink-2">덱</h3>
          <Row label="덱 ID" hint="auto = LLM이 자료/주제에서 영문 ID를 새로 만듭니다 (새 덱). 기존 덱 ID를 넣으면 그 덱에 추가·갱신됩니다." {...row('deckId')} htmlFor={id('deckId')}>
            <div className="flex gap-2">
              <Input id={id('deckId')} value={o.deckId} onChange={(e) => set('deckId', e.target.value)} placeholder="auto" className="font-mono text-[13px]" spellCheck={false} />
              {decks?.length ? (
                <Select aria-label="기존 덱에서 채우기" value="" onChange={(e) => { const d = decks.find((x) => x.id === e.target.value); if (d) onChange({ ...o, deckId: d.id, deckTitle: d.title, subject: d.subject }); }} className="w-32 shrink-0">
                  <option value="">기존 덱…</option>
                  {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </Select>
              ) : null}
            </div>
          </Row>
          <Row label="덱 제목" hint="auto = LLM이 정합니다." {...row('deckTitle')} htmlFor={id('deckTitle')}><Input id={id('deckTitle')} value={o.deckTitle} onChange={(e) => set('deckTitle', e.target.value)} placeholder="auto" /></Row>
          <Row label="과목" hint="auto = LLM이 정합니다. 가져올 때 덱 과목으로 부여되며, 가져오기 화면에서 바꿀 수 있습니다." {...row('subject')} htmlFor={id('subject')}><Input id={id('subject')} value={o.subject} onChange={(e) => set('subject', e.target.value)} placeholder="auto" /></Row>
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
        <h3 className="mb-1 text-[13px] font-semibold text-ink-2">{general ? '범위' : '자료'}</h3>
        <Row label="범위 배분" {...row('coverage')} htmlFor={id('cov')}>
          <Select id={id('cov')} className="w-full" value={o.coverage} onChange={(e) => set('coverage', e.target.value as PromptOptions['coverage'])}>{COVERAGES.map((c) => <option key={c} value={c}>{COVERAGE_KO[c]}</option>)}</Select>
        </Row>
        {!general ? (
          <>
            <Row label="자료 밖 정보 허용" hint="끄면 첨부 자료에 없는 사실은 출제하지 않습니다." {...row('allowOutOfScopeInformation')} htmlFor={id('oos')}>
              <Switch id={id('oos')} checked={o.allowOutOfScopeInformation} onCheckedChange={(v) => set('allowOutOfScopeInformation', v)} />
            </Row>
            <Row label="출처 위치 표기" hint="문항마다 자료의 페이지·슬라이드 등을 기록합니다." {...row('includeSourceLocators')} htmlFor={id('loc')}>
              <Select id={id('loc')} className="w-full" value={o.includeSourceLocators} onChange={(e) => set('includeSourceLocators', e.target.value as PromptOptions['includeSourceLocators'])}>{SOURCE_LOCATORS.map((l) => <option key={l} value={l}>{LOCATOR_KO[l]}</option>)}</Select>
            </Row>
          </>
        ) : <p className="py-2 text-[12px] text-ink-3">일반 지식 모드에서는 출처·위치 표기를 넣지 않고, 자료 밖 정보 제한도 적용되지 않습니다.</p>}
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-ink-2">문항 구성</h3>
        <Row label="난이도 분포" hint="하나를 움직이면 나머지가 비례해서 따라와 합이 항상 100%입니다." {...row('difficulty')}>
          <div className="space-y-1.5">
            {(['easy', 'medium', 'hard'] as const).map((k) => (
              <ShareRow key={k} id={id(`d-${k}`)} label={{ easy: '쉬움', medium: '보통', hard: '어려움' }[k]} value={o.difficulty[k]} onChange={(v) => set('difficulty', rebalancePercentages(o.difficulty, k, v))} />
            ))}
            {diffSum !== 100 ? <div className="pt-1"><SumBadge sum={diffSum} /></div> : null}
          </div>
        </Row>
        <Row label="유형별 목표 비율" hint="핵심 8종의 대략적 목표 비율(지침). 하나를 움직이면 나머지가 비례해서 따라와 합이 항상 100%이며, 내용에 맞지 않는 유형을 억지로 채우지는 않습니다." {...row('typeTarget')}>
          <div className="space-y-1.5">
            {CORE_TYPES.map((t) => <ShareRow key={t} id={id(`t-${t}`)} label={TYPE_LABEL_KO[t]} value={o.typeTarget[t]} onChange={(v) => set('typeTarget', rebalancePercentages(o.typeTarget, t, v))} />)}
            {typeSum !== 100 ? <div className="pt-1"><SumBadge sum={typeSum} /></div> : null}
          </div>
        </Row>
        <Row label="핵심 8종 모두 포함" hint="문항이 8개 이상이면 각 유형을 최소 1개씩 만듭니다. 자연스럽게 맞는 내용이 없는 유형은 뺍니다." {...row('requireAllEightTypes')} htmlFor={id('all8')}>
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
  if (o.deckId.trim() && o.deckId.trim() !== 'auto' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(o.deckId.trim())) items.push('덱 ID는 영문·숫자로 시작하고 영문·숫자·밑줄·하이픈만 쓸 수 있습니다 (또는 auto).');
  if (o.sourceMode === 'general_knowledge' && !o.mainTopic.trim()) items.push('일반 지식 모드: 대주제를 입력하세요.');
  if (!items.length) return null;
  return (
    <ul className={cn('space-y-1 text-[12px] text-warn-ink', className)} role="status">
      {items.map((t) => <li key={t}>· {t}</li>)}
    </ul>
  );
}
