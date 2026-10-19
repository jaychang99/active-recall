import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('decks/:id/batch.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  deck(@Param('id') id: string) {
    return this.exports.deckBatch(id);
  }

  @Get('backup.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  backup() {
    return this.exports.backup();
  }

  @Post('restore')
  @HttpCode(200)
  restore(@Body() body: Record<string, unknown>, @Query('force') force?: string) {
    return this.exports.restore(body, force === 'true');
  }

  @Get('reviews.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  reviews(@Query('deckId') deckId?: string) {
    return this.exports.reviewsCsv(deckId);
  }
}
