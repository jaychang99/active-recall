import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';
import { CardsService } from './cards.service';

class BulkDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsString({ each: true }) questionIds!: string[];
  @IsIn(['flag', 'unflag', 'suspend', 'resume', 'bury', 'unbury', 'reset']) action!: 'flag' | 'unflag' | 'suspend' | 'resume' | 'bury' | 'unbury' | 'reset';
}

@ApiTags('cards')
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post(':questionId/flag') @HttpCode(200) flag(@Param('questionId') id: string) { return this.cards.setFlag(id, true); }
  @Post(':questionId/unflag') @HttpCode(200) unflag(@Param('questionId') id: string) { return this.cards.setFlag(id, false); }
  @Post(':questionId/suspend') @HttpCode(200) suspend(@Param('questionId') id: string) { return this.cards.setSuspended(id, true); }
  @Post(':questionId/resume') @HttpCode(200) resume(@Param('questionId') id: string) { return this.cards.setSuspended(id, false); }
  @Post(':questionId/bury') @HttpCode(200) bury(@Param('questionId') id: string) { return this.cards.bury(id); }
  @Post(':questionId/unbury') @HttpCode(200) unbury(@Param('questionId') id: string) { return this.cards.unbury(id); }
  @Post(':questionId/reset') @HttpCode(200) reset(@Param('questionId') id: string) { return this.cards.reset(id); }
  @Post('bulk') @HttpCode(200) bulk(@Body() dto: BulkDto) { return this.cards.bulk(dto.questionIds, dto.action); }
}
