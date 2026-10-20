import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) newCardsPerDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5000) reviewsPerDay?: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() shortcutsEnabled?: boolean;
  @IsOptional() @IsBoolean() showIntervalPreview?: boolean;
  @IsOptional() @IsBoolean() autoAdvanceAfterRating?: boolean;
  @IsOptional() @IsNumber() @Min(0.7) @Max(0.98) requestRetention?: number;
  @IsOptional() @IsInt() @Min(1) @Max(36500) maximumInterval?: number;
  @IsOptional() @IsBoolean() enableFuzz?: boolean;
  @IsOptional() @IsBoolean() shuffleChoices?: boolean;
  @IsOptional() @IsBoolean() hideDifficulty?: boolean;
  @IsOptional() @IsBoolean() hideTags?: boolean;
  @IsOptional() @IsBoolean() hideSubject?: boolean;
  @IsOptional() @IsBoolean() hideSource?: boolean;
  @IsOptional() @IsBoolean() revealMetaOnAnswer?: boolean;
  @IsOptional() @IsIn(['deck', 'random']) newCardOrder?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) dailyReviewGoal?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) leechThreshold?: number;
  /** Partial CONFIG overrides for the generator prompt; null resets to the prompt's own values. */
  @ValidateIf((_, v) => v !== null) @IsOptional() @IsObject() promptDefaults?: Record<string, unknown> | null;
}
