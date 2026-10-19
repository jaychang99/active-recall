import { questionBatchSchema } from '@recall/contracts';
import generatorPrompt from '@/lib/generated/question-generator-prompt';

/** The exact text handed to an external LLM: prompt + schema (the schema is attached inline). */
export function buildPromptBundle(opts?: { deckId?: string; deckTitle?: string; subject?: string; language?: string; count?: number }): string {
  let prompt = generatorPrompt;
  if (opts?.deckId) prompt = prompt.replace(/DECK_ID: .*/, `DECK_ID: ${opts.deckId}`);
  if (opts?.deckTitle) prompt = prompt.replace(/DECK_TITLE: .*/, `DECK_TITLE: ${opts.deckTitle}`);
  if (opts?.subject) prompt = prompt.replace(/SUBJECT: .*/, `SUBJECT: ${opts.subject}`);
  if (opts?.language) prompt = prompt.replace(/OUTPUT_LANGUAGE: .*/, `OUTPUT_LANGUAGE: ${opts.language}`);
  if (opts?.count) prompt = prompt.replace(/NUMBER_OF_QUESTIONS: .*/, `NUMBER_OF_QUESTIONS: ${opts.count}`);
  return `${prompt.trim()}\n\n---\n\n## ATTACHED SCHEMA — question-batch.schema.json (JSON Schema Draft 2020-12)\n\n\`\`\`json\n${JSON.stringify(questionBatchSchema, null, 2)}\n\`\`\`\n`;
}

export function schemaText(): string {
  return JSON.stringify(questionBatchSchema, null, 2);
}

export function promptText(): string {
  return generatorPrompt;
}
