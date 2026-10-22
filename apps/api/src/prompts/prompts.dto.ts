import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

class DifficultyDto {
  @IsInt() @Min(0) @Max(100) easy!: number;
  @IsInt() @Min(0) @Max(100) medium!: number;
  @IsInt() @Min(0) @Max(100) hard!: number;
}

class TypeTargetDto {
  @IsInt() @Min(0) @Max(100) single_choice!: number;
  @IsInt() @Min(0) @Max(100) multiple_choice!: number;
  @IsInt() @Min(0) @Max(100) true_false!: number;
  @IsInt() @Min(0) @Max(100) short_answer!: number;
  @IsInt() @Min(0) @Max(100) essay!: number;
  @IsInt() @Min(0) @Max(100) cloze!: number;
  @IsInt() @Min(0) @Max(100) ordering!: number;
  @IsInt() @Min(0) @Max(100) matching!: number;
}

/** Required in full: a snapshot must survive later changes to the user's defaults. */
export class PromptOptionsDto {
  @IsString() deckId!: string;
  @IsString() deckTitle!: string;
  @IsString() subject!: string;
  @IsString() outputLanguage!: string;
  @ValidateIf((o, v) => v !== 'auto' || o.sourceMode !== 'provided_materials') @IsInt() @Min(1) @Max(10_000) numberOfQuestions!: number | 'auto';
  @IsIn(['provided_materials', 'general_knowledge']) sourceMode!: string;
  @IsString() mainTopic!: string;
  @IsArray() @IsString({ each: true }) subtopics!: string[];
  @IsString() audienceLevel!: string;
  @IsIn(['balanced_across_topics', 'follow_material_order']) coverage!: string;
  @IsObject() @ValidateNested() @Type(() => DifficultyDto) difficulty!: DifficultyDto;
  @IsObject() @ValidateNested() @Type(() => TypeTargetDto) typeTarget!: TypeTargetDto;
  @IsBoolean() requireAllEightTypes!: boolean;
  @IsBoolean() allowExtendedTypes!: boolean;
  @IsInt() @Min(2) @Max(8) mcqChoiceCount!: number;
  @IsIn(['brief', 'standard', 'detailed']) explanationDepth!: string;
  @IsIn(['latex', 'plain']) mathNotation!: string;
  @IsBoolean() allowOutOfScopeInformation!: boolean;
  @IsIn(['always', 'only_if_verifiable', 'never']) includeSourceLocators!: string;
}

export class CreatePromptSnapshotDto {
  @IsIn(['history', 'preset']) kind!: 'history' | 'preset';
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((o) => o.kind === 'history') @IsIn(['bundle', 'prompt']) copyKind?: 'bundle' | 'prompt';
  @IsObject() @ValidateNested() @Type(() => PromptOptionsDto) options!: PromptOptionsDto;
}

export class RenamePromptPresetDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
}

export class ListPromptSnapshotsDto {
  @IsIn(['history', 'preset']) kind!: 'history' | 'preset';
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
