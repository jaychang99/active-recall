import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
@Controller('study')
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('queue') queue(@Query() q: QueueQuery) {
    return this.study.queue({
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

  @Get('hint/:questionId') hint(@Param('questionId') id: string) {
    return this.study.hint(id);
  }

  @Get('sessions') sessions() {
    return this.study.recentSessions();
  }

  @Post('sessions') start(@Body() dto: StartSessionDto) {
    return this.study.startSession({ scope: dto.scope, subject: dto.subject, mode: dto.mode ?? 'scheduled', queueSize: dto.queueSize ?? 0 });
  }

  @Patch('sessions/:id/end') end(@Param('id') id: string) {
    return this.study.endSession(id);
  }

  @Post('practice') practice(@Body() dto: PracticeDto) {
    return this.study.logPractice(dto);
  }
}
