import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AnswerPayload } from '@recall/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { QuestionType } from '../generated/prisma/client';
import type { StudyMode } from '../study/study.service';
import { StudySessionsService } from './study-sessions.service';

const MODES = ['scheduled', 'new', 'cram', 'mistakes', 'flagged', 'practice', 'browse'] as const;

class OpenSessionDto {
  @IsString() scope!: string; // deck id or "all"
  @IsIn(MODES) mode!: StudyMode;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsEnum(QuestionType, { each: true }) types?: QuestionType[];
  @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMax?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
  @IsOptional() @IsBoolean() fresh?: boolean;
}
class StateQuery {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) known?: number;
}
class PositionDto {
  @IsInt() @Min(0) position!: number;
}
class ItemStateDto {
  @IsOptional() @IsObject() answerPayload?: AnswerPayload | null;
  @IsOptional() @IsBoolean() revealedBeforeAnswer?: boolean;
  @IsOptional() @IsBoolean() hintUsed?: boolean;
}
class SkipDto {
  @IsBoolean() skipped!: boolean;
}
class AppendDto {
  @IsString() questionId!: string;
  @IsInt() @Min(1) reviewRound!: number;
}

@ApiTags('study')
@ApiBearerAuth()
@Controller('study/sessions')
export class StudySessionsController {
  constructor(private readonly sessions: StudySessionsService) {}

  /** Join the active session for these study parameters (any device) or start one. */
  @Post('open') open(@CurrentUser() user: AuthUser, @Body() dto: OpenSessionDto) {
    return this.sessions.open(user.id, dto);
  }

  @Get(':id/state') state(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: StateQuery) {
    return this.sessions.state(user.id, id, q.known ?? 0);
  }

  @Patch(':id/position') position(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PositionDto) {
    return this.sessions.setPosition(user.id, id, dto.position);
  }

  @Post(':id/items') append(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AppendDto) {
    return this.sessions.append(user.id, id, dto.questionId, dto.reviewRound);
  }

  @Put(':id/items/:position/state') itemState(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('position', ParseIntPipe) position: number, @Body() dto: ItemStateDto) {
    return this.sessions.setItemState(user.id, id, position, dto);
  }

  @Patch(':id/items/:position') skip(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('position', ParseIntPipe) position: number, @Body() dto: SkipDto) {
    return this.sessions.setSkipped(user.id, id, position, dto.skipped);
  }

  @Delete(':id/items/:position') remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('position', ParseIntPipe) position: number) {
    return this.sessions.removeItem(user.id, id, position);
  }
}
