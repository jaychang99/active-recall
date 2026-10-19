import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
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

@ApiTags('subjects')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}
  @Get() list() { return this.subjects.list(); }
  @Post() create(@Body() dto: CreateSubjectDto) { return this.subjects.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) { return this.subjects.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.subjects.remove(id); }
  @Post('bulk-assign') @HttpCode(200) bulk(@Body() dto: BulkAssignDto) { return this.subjects.bulkAssign(dto.questionIds, dto.name, dto.remove ?? false); }
}
