/* Seed: imports examples/example-question-batch.json (8 question types) through the real import pipeline.
 * Services are wired by hand (no Nest DI) so the script runs under tsx without decorator metadata. */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { FsrsService } from '../src/fsrs/fsrs.service';
import { SettingsService } from '../src/settings/settings.service';
import { SubjectsService } from '../src/subjects/subjects.service';
import { ImportsService } from '../src/imports/imports.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const imports = new ImportsService(prisma, new FsrsService(), new SubjectsService(prisma, new SettingsService(prisma)));
  const file = process.argv[2] ?? join(__dirname, '..', '..', '..', 'examples', 'example-question-batch.json');
  const batch = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const report = await imports.commit(batch, 'upsert');
  console.log(`Seeded deck ${report.deckId}:`, report.counts);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
