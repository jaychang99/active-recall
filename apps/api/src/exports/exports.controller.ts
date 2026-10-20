import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExportsService } from './exports.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';

@ApiTags('exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('decks/:id/batch.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  deck(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.exports.deckBatch(user.id, id);
  }

  @Get('backup.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  backup(@CurrentUser() user: AuthUser) {
    return this.exports.backup(user.id);
  }

  @Post('restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Query('force') force?: string) {
    return this.exports.restore(user.id, body, force === 'true');
  }

  @Get('reviews.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  reviews(@CurrentUser() user: AuthUser, @Query('deckId') deckId?: string) {
    return this.exports.reviewsCsv(user.id, deckId);
  }
}
