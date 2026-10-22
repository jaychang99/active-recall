import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { CreatePromptSnapshotDto, ListPromptSnapshotsDto, RenamePromptPresetDto } from './prompts.dto';
import { PromptsService } from './prompts.service';

@ApiTags('prompt-library')
@ApiBearerAuth()
@Controller('prompt-library')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query() query: ListPromptSnapshotsDto) { return this.prompts.list(user.id, query); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromptSnapshotDto) { return this.prompts.create(user.id, dto); }
  @Patch(':id') rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RenamePromptPresetDto) { return this.prompts.rename(user.id, id, dto.name); }
  @Delete(':id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.prompts.remove(user.id, id); }
}
