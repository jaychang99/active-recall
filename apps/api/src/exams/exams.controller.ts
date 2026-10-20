import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ExamsService } from './exams.service';
import { CreateExamDto, SubmitExamDto } from './exams.dto';

@ApiTags('exams')
@ApiBearerAuth()
@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query('deckId') deckId?: string) { return this.exams.list(user.id, deckId); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateExamDto) { return this.exams.create(user.id, dto); }
  @Get(':id') get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.exams.get(user.id, id); }
  @Post(':id/submit') @HttpCode(200) submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitExamDto) { return this.exams.submit(user.id, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.exams.remove(user.id, id); }
}
