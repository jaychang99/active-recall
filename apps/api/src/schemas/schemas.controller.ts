import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { questionBatchSchema } from '@recall/contracts';
import { Public } from '../auth/public.decorator';

function readRepoFile(...candidates: string[]): string | null {
  for (const c of candidates) if (existsSync(c)) return readFileSync(c, 'utf8');
  return null;
}
// Monorepo checkout: <root>/apps/api/dist/schemas → four levels up. Lambda bundle (single index.js at the task root): __dirname itself.
const ROOTS = [join(__dirname, '..', '..', '..', '..'), join(__dirname, '..', '..'), __dirname, process.env.LAMBDA_TASK_ROOT ?? ''].filter(Boolean);

@ApiTags('schemas')
@Public()
@Controller('schemas')
export class SchemasController {
  @Get('question-batch.schema.json')
  @Header('Content-Type', 'application/schema+json; charset=utf-8')
  schema() {
    return questionBatchSchema;
  }

  @Get('example-question-batch.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  example() {
    return readRepoFile(...ROOTS.map((r) => join(r, 'examples', 'example-question-batch.json'))) ?? '{}';
  }

  @Get('question-generator-prompt.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  prompt() {
    return readRepoFile(...ROOTS.map((r) => join(r, 'docs', 'QUESTION_GENERATOR_PROMPT.md'))) ?? '# prompt file missing';
  }
}
