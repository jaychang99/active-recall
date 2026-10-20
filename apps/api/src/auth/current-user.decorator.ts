import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './users.service';

/** The signed-in user resolved by `AuthGuard` (`req.user`). Only valid on non-@Public routes. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a route without AuthGuard');
  return req.user;
});
