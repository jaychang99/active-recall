import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { isValidTimeZone } from '../common/time';
import { Prisma } from '../generated/prisma/client';
import type { UpdateSettingsDto } from './settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const existing = await this.prisma.appSettings.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    try {
      return await this.prisma.appSettings.create({ data: { id: 1 } });
    } catch (e) {
      // Two concurrent first requests may both try to create the singleton row.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });
      throw e;
    }
  }

  async update(dto: UpdateSettingsDto) {
    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone))
      throw ApiError.badRequest(`"${dto.timezone}" is not a valid IANA timezone`);
    await this.get();
    const { promptDefaults, ...rest } = dto;
    const data: Prisma.AppSettingsUpdateInput = { ...rest };
    if (promptDefaults !== undefined) data.promptDefaults = promptDefaults === null ? Prisma.DbNull : (promptDefaults as Prisma.InputJsonObject);
    return this.prisma.appSettings.update({ where: { id: 1 }, data });
  }
}
