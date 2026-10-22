import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePromptSnapshotDto, ListPromptSnapshotsDto } from './prompts.dto';

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListPromptSnapshotsDto) {
    const items = await this.prisma.promptSnapshot.findMany({
      where: { userId, deletedAt: null, kind: query.kind, ...(query.search?.trim() ? { name: { contains: query.search.trim() } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: 21,
    });
    return { items: items.slice(0, 20), nextOffset: items.length > 20 ? query.offset + 20 : null };
  }

  create(userId: string, dto: CreatePromptSnapshotDto) {
    return this.prisma.promptSnapshot.create({ data: {
      userId, kind: dto.kind, name: dto.name, copyKind: dto.kind === 'history' ? dto.copyKind : null, optionsJson: toJson(dto.options),
    } });
  }

  async rename(userId: string, id: string, name: string) {
    const result = await this.prisma.promptSnapshot.updateMany({ where: { userId, id, kind: 'preset', deletedAt: null }, data: { name } });
    if (!result.count) throw ApiError.notFound('Prompt preset', id);
    return { updated: true };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.promptSnapshot.updateMany({ where: { userId, id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!result.count) throw ApiError.notFound('Prompt snapshot', id);
    return { deleted: true };
  }
}
