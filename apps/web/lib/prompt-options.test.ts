import { describe, expect, it } from 'vitest';
import generatorPrompt from '@/lib/generated/question-generator-prompt';
import { PROMPT_DEFAULTS, applyPromptOptions, changedKeys, readConfigValues, rebalancePercentages, renderConfigBlock, resolvePromptOptions, sumDifficulty, sumTypeTarget, toSavedDefaults } from './prompt-options';

describe('prompt options', () => {
  it('parses the CONFIG block of the shipped prompt', () => {
    const v = readConfigValues(generatorPrompt);
    expect(v.NUMBER_OF_QUESTIONS).toBe('24');
    expect(v.OUTPUT_LANGUAGE).toBe('auto'); // comment stripped
    expect(PROMPT_DEFAULTS.numberOfQuestions).toBe(24);
    expect(PROMPT_DEFAULTS.mcqChoiceCount).toBe(5);
    expect(sumDifficulty(PROMPT_DEFAULTS)).toBe(100);
    expect(sumTypeTarget(PROMPT_DEFAULTS)).toBe(100);
    expect(PROMPT_DEFAULTS.typeTarget.single_choice).toBe(35);
    expect(PROMPT_DEFAULTS.deckId).toBe('auto');
    expect(PROMPT_DEFAULTS.mainTopic).toBe('');
    expect(PROMPT_DEFAULTS.subtopics).toEqual([]);
  });

  it('writes topics for general-knowledge mode and dashes when unset', () => {
    const o = { ...PROMPT_DEFAULTS, sourceMode: 'general_knowledge' as const, mainTopic: '운영체제', subtopics: ['프로세스 스케줄링', '교착 상태'], audienceLevel: '학부 2학년', deckId: '' };
    const out = applyPromptOptions(generatorPrompt, o);
    expect(out).toMatch(/^SOURCE_MODE: general_knowledge\s+#/m);
    expect(out).toMatch(/^MAIN_TOPIC: 운영체제\s+#/m);
    expect(out).toMatch(/^SUBTOPICS: 프로세스 스케줄링; 교착 상태\s+#/m);
    expect(out).toMatch(/^AUDIENCE_LEVEL: 학부 2학년\s+#/m);
    expect(out).toMatch(/^DECK_ID: auto\s+#/m); // empty deck id falls back to auto
    expect(applyPromptOptions(generatorPrompt, PROMPT_DEFAULTS)).toMatch(/^MAIN_TOPIC: -\s+#/m);
    // topics and audience are saveable defaults like every other field
    expect(toSavedDefaults({ ...PROMPT_DEFAULTS, mainTopic: 'x', subtopics: ['y'], audienceLevel: 'z', deckTitle: 'T' })).toEqual({ mainTopic: 'x', subtopics: ['y'], audienceLevel: 'z', deckTitle: 'T' });
    expect(resolvePromptOptions(toSavedDefaults({ ...PROMPT_DEFAULTS, mainTopic: 'x', subtopics: ['y'] }))).toMatchObject({ mainTopic: 'x', subtopics: ['y'] });
    expect(resolvePromptOptions({ subtopics: ['a', 3, ' b '] }).subtopics).toEqual(['a', 'b']);
  });

  it('rewrites only the CONFIG lines and keeps comments and the rest of the document', () => {
    const o = { ...PROMPT_DEFAULTS, numberOfQuestions: 40, outputLanguage: 'ko', difficulty: { easy: 10, medium: 60, hard: 30 } };
    const out = applyPromptOptions(generatorPrompt, o);
    expect(out).toMatch(/^NUMBER_OF_QUESTIONS: 40$/m);
    expect(out).toMatch(/^OUTPUT_LANGUAGE: ko\s+# auto = /m);
    expect(out).toMatch(/^DIFFICULTY_DISTRIBUTION: easy=10%, medium=60%, hard=30%$/m);
    expect(out).toMatch(/^SCHEMA_VERSION: 1\.0\.0$/m);
    // everything outside the block is byte-identical
    const tail = (s: string) => s.slice(s.indexOf('## ROLE'));
    expect(tail(out)).toBe(tail(generatorPrompt));
    expect(renderConfigBlock(o)).toContain('NUMBER_OF_QUESTIONS: 40');
  });

  it('overlays saved partial defaults and ignores invalid values', () => {
    const r = resolvePromptOptions({ numberOfQuestions: 999, sourceMode: 'nope', mcqChoiceCount: 4, difficulty: { easy: 30 }, requireAllEightTypes: 'yes' });
    expect(r.numberOfQuestions).toBe(200); // clamped to the limit
    expect(r.sourceMode).toBe(PROMPT_DEFAULTS.sourceMode);
    expect(r.mcqChoiceCount).toBe(4);
    expect(r.difficulty).toEqual({ easy: 30, medium: 50, hard: 25 });
    expect(r.requireAllEightTypes).toBe(PROMPT_DEFAULTS.requireAllEightTypes);
    expect(resolvePromptOptions(null)).toEqual(PROMPT_DEFAULTS);
  });

  it('saves only what differs from the prompt document', () => {
    expect(toSavedDefaults(PROMPT_DEFAULTS)).toBeNull();
    const o = { ...PROMPT_DEFAULTS, numberOfQuestions: 30 };
    expect(toSavedDefaults(o)).toEqual({ numberOfQuestions: 30 });
    expect(changedKeys(o, PROMPT_DEFAULTS)).toEqual(['numberOfQuestions']);
  });
});

describe('rebalancePercentages', () => {
  it('redistributes the remainder proportionally and keeps the sum at 100', () => {
    const r = rebalancePercentages({ easy: 25, medium: 50, hard: 25 }, 'easy', 40);
    expect(r).toEqual({ easy: 40, medium: 40, hard: 20 });
    expect(r.easy + r.medium + r.hard).toBe(100);
  });
  it('rounds with largest remainder so the total is exact', () => {
    const r = rebalancePercentages({ a: 33, b: 33, c: 34 }, 'a', 50);
    expect(r.a + r.b + r.c).toBe(100);
    expect(r).toEqual({ a: 50, b: 25, c: 25 });
    const t = rebalancePercentages({ single_choice: 35, multiple_choice: 20, true_false: 10, short_answer: 10, essay: 10, cloze: 5, ordering: 5, matching: 5 }, 'essay', 0);
    expect(Object.values(t).reduce((x, y) => x + y, 0)).toBe(100);
    expect(t.essay).toBe(0);
  });
  it('shares equally when the others are all zero, and clamps the input', () => {
    expect(rebalancePercentages({ a: 100, b: 0, c: 0 }, 'a', 40)).toEqual({ a: 40, b: 30, c: 30 });
    expect(rebalancePercentages({ a: 10, b: 90 }, 'a', 250)).toEqual({ a: 100, b: 0 });
    expect(rebalancePercentages({ a: 10, b: 90 }, 'a', -5)).toEqual({ a: 0, b: 100 });
  });
});
