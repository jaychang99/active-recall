import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiError } from '../common/api-error';
import { IS_PUBLIC_KEY } from './public.decorator';
import { apiTokenSecret, verifyApiToken } from './token';
import { UsersService, type AuthUser } from './users.service';

/** Global guard: every route needs `Authorization: Bearer <api token>` unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger('Auth');
  private secret: Uint8Array | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw ApiError.unauthorized('Missing bearer token');
    this.secret ??= apiTokenSecret();
    let claims;
    try {
      claims = await verifyApiToken(header.slice('Bearer '.length).trim(), this.secret);
    } catch (e) {
      this.logger.debug(`Rejected token: ${(e as Error).message}`);
      throw ApiError.unauthorized('Invalid or expired token');
    }
    req.user = await this.users.resolve(claims);
    return true;
  }
}
