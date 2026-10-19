import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { AnswerPayload } from '@recall/contracts';

export class CreateReviewDto {
  @IsString() questionId!: string;
  @IsInt() @Min(1) @Max(4) rating!: number;
  @IsString() @MinLength(1) @MaxLength(120) idempotencyKey!: string;
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsInt() @Min(0) elapsedMs?: number;
  @IsOptional() @IsBoolean() isCorrect?: boolean | null;
  @IsOptional() @IsBoolean() revealedBeforeAnswer?: boolean;
  @IsOptional() @IsBoolean() hintUsed?: boolean;
  @IsOptional() @IsObject() answerPayload?: AnswerPayload | null;
  /** Optimistic concurrency: the CardState.version the client saw. */
  @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}
