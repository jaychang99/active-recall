import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubjectsService } from './subjects.service';

class CreateSubjectDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(16) color?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
class UpdateSubjectDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(16) color?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
}
class BulkAssignDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsString({ each: true }) questionIds!: string[];
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsBoolean() remove?: boolean;
}

class ListSubjectsQuery {
  @IsOptional() @IsIn(['true', 'false']) archived?: string;
  @IsOptional() @IsIn(['true', 'false']) includeArchived?: string;
}

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query() q: ListSubjectsQuery) { return this.subjects.list(user.id, { archived: q.archived === 'true', includeArchived: q.includeArchived === 'true' }); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubjectDto) { return this.subjects.create(user.id, dto); }
  @Patch(':id') update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSubjectDto) { return this.subjects.update(user.id, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.subjects.remove(user.id, id); }
  @Post(':id/archive') archive(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.subjects.setArchived(user.id, id, true); }
  @Post(':id/unarchive') unarchive(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.subjects.setArchived(user.id, id, false); }
  @Post('bulk-assign') @HttpCode(200) bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkAssignDto) { return this.subjects.bulkAssign(user.id, dto.questionIds, dto.name, dto.remove ?? false); }
}
