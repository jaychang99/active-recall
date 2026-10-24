import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { LlmLinksService } from './llm-links.service';
import { MAX_URL_LENGTH } from './link-preview';

class LinkBodyDto {
  @IsString() @MaxLength(MAX_URL_LENGTH) url!: string;
}

@ApiTags('llm-links')
@ApiBearerAuth()
@Controller()
export class LlmLinksController {
  constructor(private readonly links: LlmLinksService) {}

  @Get('questions/:id/llm-links') list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.links.list(user.id, id);
  }

  @Put('questions/:id/llm-links/:round') upsert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('round', ParseIntPipe) round: number, @Body() dto: LinkBodyDto) {
    return this.links.upsert(user.id, id, round, dto.url);
  }

  @Delete('questions/:id/llm-links/:round') remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('round', ParseIntPipe) round: number) {
    return this.links.remove(user.id, id, round);
  }

  /** Open Graph preview of a link (fetched live, cached in memory, never stored). */
  @Get('link-preview') preview(@Query('url') url: string) {
    return this.links.preview(url);
  }
}
