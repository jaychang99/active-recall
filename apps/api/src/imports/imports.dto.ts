import { Allow, IsIn, IsOptional } from 'class-validator';

export type ImportStrategy = 'upsert' | 'add_only' | 'replace_deck';

export class ImportBodyDto {
  /** The raw batch document (object) — validated against the JSON Schema server-side. */
  @Allow() batch!: unknown;
  @IsOptional() @IsIn(['upsert', 'add_only', 'replace_deck']) strategy?: ImportStrategy;
}
