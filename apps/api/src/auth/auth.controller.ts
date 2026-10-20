import { Controller, Delete, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import { UsersService, type AuthUser } from './users.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  /** Who the bearer token belongs to (also creates the user on first call). */
  @Get('me') me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  /** Permanently deletes the account and all of its data (irreversible). */
  @Delete('me') deleteMe(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user.id);
  }
}
