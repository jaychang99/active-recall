import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AnalyticsService } from './analytics.service';

class OverviewQuery {
  @IsOptional() @IsString() deckId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsInt() @Min(7) @Max(730) days?: number;
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('overview') overview(@Query() q: OverviewQuery) { return this.analytics.overview(q); }
  @Get('heatmap') heatmap(@Query() q: OverviewQuery) { return this.analytics.heatmap(q); }
}
