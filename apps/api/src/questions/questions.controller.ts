import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AnswerPayload } from '@recall/contracts';
import { QuestionsService } from './questions.service';
import { NotesService } from '../notes/notes.service';
import { SubjectsService } from '../subjects/subjects.service';
import { IsArray, ArrayMaxSize } from 'class-validator';

class GradeDto {
  @IsOptional() @IsObject() answerPayload?: AnswerPayload | null;
}
class NoteBodyDto {
  @IsString() @MaxLength(20000) body!: string;
}
class SubjectsDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) names!: string[];
}

@ApiTags('questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly notes: NotesService,
    private readonly subjects: SubjectsService,
  ) {}

  @Get(':id/subjects') listSubjects(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subjects.forQuestion(user.id, id);
  }

  @Put(':id/subjects') setSubjects(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubjectsDto) {
    return this.subjects.setForQuestion(user.id, id, dto.names);
  }

  @Get(':id') get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('includeAnswer') includeAnswer?: string) {
    return this.questions.get(user.id, id, includeAnswer === 'true');
  }

  @Post(':id/grade') grade(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GradeDto) {
    return this.questions.grade(user.id, id, dto.answerPayload ?? null);
  }

  @Get(':id/answer-key') answerKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.questions.answerKey(user.id, id);
  }

  @Get(':id/notes') listNotes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notes.listForQuestion(user.id, id);
  }

  @Put(':id/notes/:round') upsertNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('round', ParseIntPipe) round: number, @Body() dto: NoteBodyDto) {
    return this.notes.upsert(user.id, id, round, dto.body);
  }

  @Delete(':id/notes/:round') deleteNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('round', ParseIntPipe) round: number) {
    return this.notes.remove(user.id, id, round);
  }
}
