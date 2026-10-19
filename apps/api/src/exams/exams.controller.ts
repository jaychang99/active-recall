import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExamsService } from './exams.service';
import { CreateExamDto, SubmitExamDto } from './exams.dto';

@ApiTags('exams')
@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}
  @Get() list(@Query('deckId') deckId?: string) { return this.exams.list(deckId); }
  @Post() create(@Body() dto: CreateExamDto) { return this.exams.create(dto); }
  @Get(':id') get(@Param('id') id: string) { return this.exams.get(id); }
  @Post(':id/submit') @HttpCode(200) submit(@Param('id') id: string, @Body() dto: SubmitExamDto) { return this.exams.submit(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.exams.remove(id); }
}
