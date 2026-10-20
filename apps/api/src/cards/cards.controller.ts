import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';
import { CardsService } from './cards.service';

class BulkDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsString({ each: true }) questionIds!: string[];
  @IsIn(['flag', 'unflag', 'suspend', 'resume', 'bury', 'unbury', 'reset']) action!: 'flag' | 'unflag' | 'suspend' | 'resume' | 'bury' | 'unbury' | 'reset';
}

@ApiTags('cards')
@ApiBearerAuth()
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post(':questionId/flag') @HttpCode(200) flag(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.setFlag(user.id, id, true); }
  @Post(':questionId/unflag') @HttpCode(200) unflag(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.setFlag(user.id, id, false); }
  @Post(':questionId/suspend') @HttpCode(200) suspend(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.setSuspended(user.id, id, true); }
  @Post(':questionId/resume') @HttpCode(200) resume(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.setSuspended(user.id, id, false); }
  @Post(':questionId/bury') @HttpCode(200) bury(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.bury(user.id, id); }
  @Post(':questionId/unbury') @HttpCode(200) unbury(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.unbury(user.id, id); }
  @Post(':questionId/reset') @HttpCode(200) reset(@CurrentUser() user: AuthUser, @Param('questionId') id: string) { return this.cards.reset(user.id, id); }
  @Post('bulk') @HttpCode(200) bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkDto) { return this.cards.bulk(user.id, dto.questionIds, dto.action); }
}
