import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './reviews.dto';
import { ApiError } from '../common/api-error';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post() @HttpCode(201) create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.id, dto);
  }

  @Post(':id/undo') @HttpCode(200) undo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviews.undo(user.id, id);
  }

  @Get('responses/:questionId') responses(@CurrentUser() user: AuthUser, @Param('questionId') questionId: string) {
    return this.reviews.responses(user.id, questionId);
  }

  @Get() list(@CurrentUser() user: AuthUser, @Query('questionId') questionId?: string) {
    if (!questionId) throw ApiError.badRequest('questionId query parameter is required');
    return this.reviews.listForQuestion(user.id, questionId);
  }
}
