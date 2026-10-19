import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './reviews.dto';
import { ApiError } from '../common/api-error';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post() @HttpCode(201) create(@Body() dto: CreateReviewDto) {
    return this.reviews.create(dto);
  }

  @Post(':id/undo') @HttpCode(200) undo(@Param('id') id: string) {
    return this.reviews.undo(id);
  }

  @Get() list(@Query('questionId') questionId?: string) {
    if (!questionId) throw ApiError.badRequest('questionId query parameter is required');
    return this.reviews.listForQuestion(questionId);
  }
}
