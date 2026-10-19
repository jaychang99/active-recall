// Copies docs/QUESTION_GENERATOR_PROMPT.md into the web bundle so the "Copy LLM prompt" button needs no API call.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs', 'QUESTION_GENERATOR_PROMPT.md'), 'utf8');
const out = join(root, 'apps', 'web', 'lib', 'generated', 'question-generator-prompt.ts');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `// AUTO-GENERATED from docs/QUESTION_GENERATOR_PROMPT.md by scripts/sync-prompt.mjs — do not edit.\nconst prompt = ${JSON.stringify(src)};\nexport default prompt;\n`);
console.log('synced', out);
