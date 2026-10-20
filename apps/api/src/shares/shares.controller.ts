import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ShareKind } from '../generated/prisma/client';
import { MAX_RECIPIENTS, SharesService } from './shares.service';

class SendShareDto {
  @IsEnum(ShareKind) kind!: ShareKind;
  @IsOptional() @IsString() deckId?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @IsString({ each: true }) questionIds?: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_RECIPIENTS) @IsString({ each: true }) @MaxLength(320, { each: true }) emails!: string[];
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
}
class AcceptTargetDto {
  @IsString() @MaxLength(16) group!: string;
  @IsIn(['new', 'existing']) mode!: 'new' | 'existing';
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() deckId?: string;
  @IsOptional() @IsIn(['add_only', 'upsert']) strategy?: 'add_only' | 'upsert';
}
class AcceptShareDto {
  @IsOptional() @IsArray() @ArrayMaxSize(20000) @IsString({ each: true }) exclude?: string[];
  @IsOptional() @IsIn(['keep', 'merge']) layout?: 'keep' | 'merge';
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => AcceptTargetDto) targets?: AcceptTargetDto[];
  @IsOptional() @IsObject() subjectMap?: Record<string, string>;
  @IsOptional() @IsBoolean() extraSubjects?: boolean;
}

/** Share decks / subjects / questions by e-mail; the recipient accepts a copy (fresh learning state). */
@ApiTags('shares')
@ApiBearerAuth()
@Controller('shares')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post() send(@CurrentUser() user: AuthUser, @Body() dto: SendShareDto) {
    return this.shares.send(user, dto);
  }

  @Get('sent') sent(@CurrentUser() user: AuthUser) {
    return this.shares.sent(user.id);
  }

  @Post(':id/cancel') @HttpCode(200) cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shares.cancel(user.id, id);
  }

  @Get('received') received(@CurrentUser() user: AuthUser) {
    return this.shares.received(user);
  }

  @Get('received/count') count(@CurrentUser() user: AuthUser) {
    return this.shares.pendingCount(user);
  }

  @Get('received/:id') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shares.detail(user, id);
  }

  @Post('received/:id/accept') @HttpCode(200) accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AcceptShareDto) {
    return this.shares.accept(user, id, dto);
  }

  @Post('received/:id/decline') @HttpCode(200) decline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shares.decline(user, id);
  }
}
