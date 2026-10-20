import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { UsersService } from './users.service';

@Module({
  controllers: [AuthController],
  providers: [UsersService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [UsersService],
})
export class AuthModule {}
