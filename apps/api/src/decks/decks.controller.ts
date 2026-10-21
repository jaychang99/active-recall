import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DecksService } from './decks.service';
import { CardStatus, QuestionType } from '../generated/prisma/client';
import { NotesService } from '../notes/notes.service';

const bool = ({ value }: { value: unknown }) => value === 'true' || value === true;

class ListDecksQuery {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @Transform(bool) @IsBoolean() includeDeleted?: boolean;
  @IsOptional() @IsIn(['true', 'false']) archived?: string;
  @IsOptional() @IsIn(['true', 'false']) includeArchived?: string;
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
class AddSubjectDto {
  @IsString() @MaxLength(200) name!: string;
}
class UpdateDeckDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(35) language?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

@ApiTags('decks')
@ApiBearerAuth()
@Controller('decks')
export class DecksController {
  constructor(
    private readonly decks: DecksService,
    private readonly notes: NotesService,
  ) {}

  @Get() list(@CurrentUser() user: AuthUser, @Query() q: ListDecksQuery) {
    return this.decks.list(user.id, { subject: q.subject, includeDeleted: q.includeDeleted, archived: q.archived === 'true', includeArchived: q.includeArchived === 'true' });
  }

  @Get('by-subject') bySubject(@CurrentUser() user: AuthUser) {
    return this.decks.subjects(user.id);
  }

  @Get(':id') get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.decks.get(user.id, id);
  }

  @Patch(':id') update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDeckDto) {
    return this.decks.update(user.id, id, dto);
  }

  @Get(':id/questions')
  @ApiQuery({ name: 'includeAnswers', required: false, description: 'true to include answer keys (answer-key review mode)' })
  questions(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: ListQuestionsQuery) {
    return this.decks.questions(user.id, id, {
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

  /** Add an extra subject to all questions of the deck (primary subject unchanged). To replace the primary subject use PATCH /decks/:id { subject }. */
  @Post(':id/subjects') addSubject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddSubjectDto) {
    return this.decks.addSubject(user.id, id, dto.name);
  }

  @Get(':id/notes') notesForDeck(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notes.listForDeck(user.id, id);
  }

  @Delete(':id')
  @ApiQuery({ name: 'permanent', required: false, description: 'true = hard delete with all history (irreversible)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('permanent') permanent?: string) {
    return this.decks.remove(user.id, id, permanent === 'true');
  }

  @Post(':id/restore') restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.decks.restore(user.id, id);
  }

  @Post(':id/archive') archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.decks.setArchived(user.id, id, true);
  }

  @Post(':id/unarchive') unarchive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.decks.setArchived(user.id, id, false);
  }
}
