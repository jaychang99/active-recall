import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/users.service';
import { ImportsService } from './imports.service';
import { ImportBodyDto } from './imports.dto';
import { ApiError } from '../common/api-error';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('validate')
  @HttpCode(200)
  @ApiBody({ schema: { properties: { batch: { type: 'object' }, strategy: { type: 'string', enum: ['upsert', 'add_only', 'replace_deck'] } } } })
  validate(@CurrentUser() user: AuthUser, @Body() body: ImportBodyDto) {
    if (body.batch === undefined) throw ApiError.badRequest('Request body must contain "batch"');
    return this.imports.plan(user.id, body.batch, body.strategy ?? 'upsert');
  }

  @Post('commit')
  @HttpCode(200)
  @ApiBody({ schema: { properties: { batch: { type: 'object' }, strategy: { type: 'string', enum: ['upsert', 'add_only', 'replace_deck'] } } } })
  commit(@CurrentUser() user: AuthUser, @Body() body: ImportBodyDto) {
    if (body.batch === undefined) throw ApiError.badRequest('Request body must contain "batch"');
    return this.imports.commit(user.id, body.batch, body.strategy ?? 'upsert');
  }
}
