import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DecksService } from './decks.service';
import { CardStatus, QuestionType } from '../generated/prisma/client';
import { NotesService } from '../notes/notes.service';

const bool = ({ value }: { value: unknown }) => value === 'true' || value === true;

class ListDecksQuery {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @Transform(bool) @IsBoolean() includeDeleted?: boolean;
}
class ListQuestionsQuery {
  @IsOptional() @IsInt() @Min(1) page: number = 1;
  @IsOptional() @IsInt() @Min(1) @Max(200) pageSize: number = 50;
  @IsOptional() @IsEnum(QuestionType) type?: QuestionType;
  @IsOptional() @IsEnum(CardStatus) status?: CardStatus;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['deck', 'due', 'lapses', 'difficulty', 'reps', 'updated']) sort?: string;
  @IsOptional() @Transform(bool) @IsBoolean() includeAnswers?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() includeInactive?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() flagged?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() suspended?: boolean;
}
class UpdateDeckDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(35) language?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

@ApiTags('decks')
@Controller('decks')
export class DecksController {
  constructor(
    private readonly decks: DecksService,
    private readonly notes: NotesService,
  ) {}

  @Get() list(@Query() q: ListDecksQuery) {
    return this.decks.list({ subject: q.subject, includeDeleted: q.includeDeleted });
  }

  @Get('by-subject') bySubject() {
    return this.decks.subjects();
  }

  @Get(':id') get(@Param('id') id: string) {
    return this.decks.get(id);
  }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateDeckDto) {
    return this.decks.update(id, dto);
  }

  @Get(':id/questions')
  @ApiQuery({ name: 'includeAnswers', required: false, description: 'true to include answer keys (answer-key review mode)' })
  questions(@Param('id') id: string, @Query() q: ListQuestionsQuery) {
    return this.decks.questions(id, {
      page: q.page,
      pageSize: q.pageSize,
      type: q.type,
      status: q.status,
      tag: q.tag,
      q: q.q,
      sort: q.sort,
      includeAnswers: q.includeAnswers ?? false,
      includeInactive: q.includeInactive ?? false,
      flagged: q.flagged,
      suspended: q.suspended,
    });
  }

  @Get(':id/notes') notesForDeck(@Param('id') id: string) {
    return this.notes.listForDeck(id);
  }

  @Delete(':id')
  @ApiQuery({ name: 'permanent', required: false, description: 'true = hard delete with all history (irreversible)' })
  remove(@Param('id') id: string, @Query('permanent') permanent?: string) {
    return this.decks.remove(id, permanent === 'true');
  }

  @Post(':id/restore') restore(@Param('id') id: string) {
    return this.decks.restore(id);
  }
}
