import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { isValidTimeZone } from '../common/time';
import { Prisma } from '../generated/prisma/client';
import type { UpdateSettingsDto } from './settings.dto';

/** One settings row per user, created lazily with the defaults on first read. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const existing = await this.prisma.appSettings.findUnique({ where: { userId } });
    if (existing) return existing;
    try {
      return await this.prisma.appSettings.create({ data: { userId } });
    } catch (e) {
      // Two concurrent first requests may both try to create the row.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.prisma.appSettings.findUniqueOrThrow({ where: { userId } });
      throw e;
    }
  }

  async update(userId: string, dto: UpdateSettingsDto) {
    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone))
      throw ApiError.badRequest(`"${dto.timezone}" is not a valid IANA timezone`);
    await this.get(userId);
    const { promptDefaults, ...rest } = dto;
    const data: Prisma.AppSettingsUpdateInput = { ...rest };
    if (promptDefaults !== undefined) data.promptDefaults = promptDefaults === null ? Prisma.DbNull : (promptDefaults as Prisma.InputJsonObject);
    return this.prisma.appSettings.update({ where: { userId }, data });
  }
}
