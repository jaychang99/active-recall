import { questionBatchSchema } from '@recall/contracts';
import generatorPrompt from '@/lib/generated/question-generator-prompt';
import { PROMPT_DEFAULTS, applyPromptOptions, type PromptOptions } from '@/lib/prompt-options';

/** The generator prompt with the CONFIG block filled from `opts` (defaults: the values written in the prompt document). */
export function promptText(opts: PromptOptions = PROMPT_DEFAULTS): string {
  return applyPromptOptions(generatorPrompt, opts);
}

/** The exact text handed to an external LLM: prompt + schema (the schema is attached inline). */
export function buildPromptBundle(opts: PromptOptions = PROMPT_DEFAULTS): string {
  return `${promptText(opts).trim()}\n\n---\n\n## ATTACHED SCHEMA — question-batch.schema.json (JSON Schema Draft 2020-12)\n\n\`\`\`json\n${JSON.stringify(questionBatchSchema, null, 2)}\n\`\`\`\n`;
}

export function schemaText(): string {
  return JSON.stringify(questionBatchSchema, null, 2);
}
