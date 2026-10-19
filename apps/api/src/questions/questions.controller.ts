import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly notes: NotesService,
    private readonly subjects: SubjectsService,
  ) {}

  @Get(':id/subjects') listSubjects(@Param('id') id: string) {
    return this.subjects.forQuestion(id);
  }

  @Put(':id/subjects') setSubjects(@Param('id') id: string, @Body() dto: SubjectsDto) {
    return this.subjects.setForQuestion(id, dto.names);
  }

  @Get(':id') get(@Param('id') id: string, @Query('includeAnswer') includeAnswer?: string) {
    return this.questions.get(id, includeAnswer === 'true');
  }

  @Post(':id/grade') grade(@Param('id') id: string, @Body() dto: GradeDto) {
    return this.questions.grade(id, dto.answerPayload ?? null);
  }

  @Get(':id/answer-key') answerKey(@Param('id') id: string) {
    return this.questions.answerKey(id);
  }

  @Get(':id/notes') listNotes(@Param('id') id: string) {
    return this.notes.listForQuestion(id);
  }

  @Put(':id/notes/:round') upsertNote(@Param('id') id: string, @Param('round', ParseIntPipe) round: number, @Body() dto: NoteBodyDto) {
    return this.notes.upsert(id, round, dto.body);
  }

  @Delete(':id/notes/:round') deleteNote(@Param('id') id: string, @Param('round', ParseIntPipe) round: number) {
    return this.notes.remove(id, round);
  }
}
