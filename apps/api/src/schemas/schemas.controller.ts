import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { questionBatchSchema } from '@recall/contracts';

function readRepoFile(...candidates: string[]): string | null {
  for (const c of candidates) if (existsSync(c)) return readFileSync(c, 'utf8');
  return null;
}
const ROOT = join(__dirname, '..', '..', '..', '..');

@ApiTags('schemas')
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
    return readRepoFile(join(ROOT, 'examples', 'example-question-batch.json')) ?? '{}';
  }

  @Get('question-generator-prompt.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  prompt() {
    return readRepoFile(join(ROOT, 'docs', 'QUESTION_GENERATOR_PROMPT.md')) ?? '# prompt file missing';
  }
}
