import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AnalyticsService } from './analytics.service';

class OverviewQuery {
  @IsOptional() @IsString() deckId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsInt() @Min(7) @Max(730) days?: number;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('overview') overview(@CurrentUser() user: AuthUser, @Query() q: OverviewQuery) { return this.analytics.overview(user.id, q); }
  @Get('heatmap') heatmap(@CurrentUser() user: AuthUser, @Query() q: OverviewQuery) { return this.analytics.heatmap(user.id, q); }
}
