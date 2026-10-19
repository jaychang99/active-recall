import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @IsOptional() @IsIn(['deck', 'random']) newCardOrder?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) dailyReviewGoal?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) leechThreshold?: number;
}
