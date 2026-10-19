import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { AnswerPayload } from '@recall/contracts';
import { QuestionType } from '../generated/prisma/client';

export class CreateExamDto {
  @IsString() deckId!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) count?: number;
  @IsOptional() @IsBoolean() shuffle?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsEnum(QuestionType, { each: true }) types?: QuestionType[];
  @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMax?: number;
  @IsOptional() @IsInt() @Min(30) @Max(6 * 3600) timeLimitSec?: number;
  /** Build the exam from the wrong answers of a previous attempt. */
  @IsOptional() @IsString() retryOfAttemptId?: string;
}

export class ExamResponseDto {
  @IsString() questionId!: string;
  @IsOptional() @IsObject() answerPayload?: AnswerPayload | null;
  @IsOptional() @IsArray() @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : value)) selfScores?: number[];
}

export class SubmitExamDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => ExamResponseDto) responses!: ExamResponseDto[];
}
