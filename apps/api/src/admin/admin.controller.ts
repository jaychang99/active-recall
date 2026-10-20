import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { AdminService, type BulkAction } from './admin.service';
import { ApiError } from '../common/api-error';

class ListDto {
  @IsOptional() @IsInt() @Min(1) page: number = 1;
  @IsOptional() @IsInt() @Min(1) @Max(500) pageSize: number = 50;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc';
  @IsOptional() @IsString() search?: string;
  /** JSON-encoded filters object */
  @IsOptional() @IsString() filters?: string;
  @IsOptional() @IsIn(['live', 'deleted', 'all']) deleted: 'live' | 'deleted' | 'all' = 'live';
}
class BulkDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsString({ each: true }) ids!: string[];
  @IsIn(['delete', 'restore', 'permanent', 'patch']) action!: BulkAction;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('entities') entities() {
    return this.admin.entities();
  }

  @Get('counts') counts(@CurrentUser() user: AuthUser) {
    return this.admin.counts(user.id);
  }

  @Get(':entity') list(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Query() q: ListDto) {
    let filters: Record<string, unknown> | undefined;
    if (q.filters) {
      try {
        filters = JSON.parse(q.filters) as Record<string, unknown>;
      } catch {
        throw ApiError.badRequest('filters must be a JSON object');
      }
    }
    return this.admin.list(user.id, entity, { page: q.page, pageSize: q.pageSize, sort: q.sort, dir: q.dir, search: q.search, filters, deleted: q.deleted });
  }

  @Get(':entity/options') options(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Query('search') search?: string) {
    return this.admin.options(user.id, entity, search);
  }

  @Get(':entity/:id') get(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Param('id') id: string) {
    return this.admin.get(user.id, entity, id);
  }

  @Post(':entity') create(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Body() body: Record<string, unknown>) {
    return this.admin.create(user.id, entity, body);
  }

  @Post(':entity/bulk') @HttpCode(200) bulk(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Body() body: BulkDto) {
    return this.admin.bulk(user.id, entity, body.ids, body.action, body.data);
  }

  @Patch(':entity/:id') update(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.update(user.id, entity, id, body);
  }

  @Delete(':entity/:id') remove(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Param('id') id: string, @Query('permanent') permanent?: string) {
    return this.admin.remove(user.id, entity, id, permanent === 'true');
  }

  @Post(':entity/:id/restore') @HttpCode(200) restore(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Param('id') id: string) {
    return this.admin.restore(user.id, entity, id);
  }
}
