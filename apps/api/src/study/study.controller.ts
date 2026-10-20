import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AnswerPayload } from '@recall/contracts';
import { StudyService, type StudyMode } from './study.service';
import { QuestionType } from '../generated/prisma/client';

const MODES = ['scheduled', 'cram', 'mistakes', 'flagged', 'practice'] as const;
const toList = ({ value }: { value: unknown }) => (Array.isArray(value) ? value : typeof value === 'string' && value.length ? value.split(',') : undefined);

class QueueQuery {
  @IsOptional() @IsString() deckId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsIn(MODES) mode?: StudyMode;
  @IsOptional() @Transform(toList) @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @Transform(toList) @IsArray() @IsEnum(QuestionType, { each: true }) types?: QuestionType[];
  @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMax?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() shuffle?: boolean;
}
class StartSessionDto {
  @IsString() scope!: string; // deck id or "all"
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsIn(MODES) mode?: StudyMode;
  @IsOptional() @IsInt() @Min(0) queueSize?: number;
}
class PracticeDto {
  @IsString() questionId!: string;
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsObject() answerPayload?: AnswerPayload | null;
  @IsOptional() @IsInt() @Min(0) elapsedMs?: number;
}

@ApiTags('study')
@ApiBearerAuth()
@Controller('study')
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('queue') queue(@CurrentUser() user: AuthUser, @Query() q: QueueQuery) {
    return this.study.queue(user.id, {
      scope: q.deckId ?? 'all',
      subject: q.subject,
      mode: q.mode ?? 'scheduled',
      tags: q.tags,
      types: q.types,
      difficultyMin: q.difficultyMin,
      difficultyMax: q.difficultyMax,
      limit: q.limit ?? 100,
      shuffle: q.shuffle,
    });
  }

  @Get('hint/:questionId') hint(@CurrentUser() user: AuthUser, @Param('questionId') id: string) {
    return this.study.hint(user.id, id);
  }

  @Get('sessions') sessions(@CurrentUser() user: AuthUser) {
    return this.study.recentSessions(user.id);
  }

  @Post('sessions') start(@CurrentUser() user: AuthUser, @Body() dto: StartSessionDto) {
    return this.study.startSession(user.id, { scope: dto.scope, subject: dto.subject, mode: dto.mode ?? 'scheduled', queueSize: dto.queueSize ?? 0 });
  }

  @Patch('sessions/:id/end') end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.study.endSession(user.id, id);
  }

  @Post('practice') practice(@CurrentUser() user: AuthUser, @Body() dto: PracticeDto) {
    return this.study.logPractice(user.id, dto);
  }
}
