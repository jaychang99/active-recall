import { describe, expect, it } from 'vitest';
import generatorPrompt from '@/lib/generated/question-generator-prompt';
import { PROMPT_DEFAULTS, applyPromptOptions, changedKeys, readConfigValues, renderConfigBlock, resolvePromptOptions, sumDifficulty, sumTypeTarget, toSavedDefaults } from './prompt-options';

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
