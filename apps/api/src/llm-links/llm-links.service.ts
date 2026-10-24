import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { LinkPreviewCache, parsePublicUrl } from './link-preview';

/**
 * Links to external LLM answers about a question, one per review round (same rounds as notes: the current
 * round is effective reviews + 1). Soft-deleted like everything else; re-saving a round revives it.
 */
@Injectable()
export class LlmLinksService {
  private readonly previews = new LinkPreviewCache();
  constructor(private readonly prisma: PrismaService) {}

  private async ownedRound(userId: string, questionId: string) {
    const exists = await this.prisma.question.findFirst({ where: { id: questionId, userId, deletedAt: null }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Question', questionId);
    return (await this.prisma.reviewLog.count({ where: { userId, questionId, undone: false, deletedAt: null } })) + 1;
  }

  async list(userId: string, questionId: string) {
    const currentRound = await this.ownedRound(userId, questionId);
    const [links, reviews] = await Promise.all([
      this.prisma.llmAnswerLink.findMany({ where: { userId, questionId, deletedAt: null }, orderBy: { reviewRound: 'desc' } }),
      this.prisma.reviewLog.findMany({ where: { userId, questionId, undone: false, deletedAt: null }, select: { reviewRound: true, rating: true, reviewedAt: true } }),
    ]);
    const byRound = new Map(reviews.map((r) => [r.reviewRound, r]));
    return {
      questionId,
      currentRound,
      links: links.map((l) => {
        const r = byRound.get(l.reviewRound);
        return { reviewRound: l.reviewRound, url: l.url, createdAt: l.createdAt, updatedAt: l.updatedAt, review: r ? { rating: r.rating, reviewedAt: r.reviewedAt } : null };
      }),
    };
  }

  async upsert(userId: string, questionId: string, round: number, rawUrl: string) {
    const current = await this.ownedRound(userId, questionId);
    if (!Number.isInteger(round) || round < 1 || round > current) throw ApiError.badRequest(`reviewRound must be between 1 and the current round (${current})`);
    const url = parsePublicUrl(rawUrl);
    if (!url) throw ApiError.badRequest('Enter a public http(s) link (no local or private addresses).');
    const link = await this.prisma.llmAnswerLink.upsert({
      where: { questionId_reviewRound: { questionId, reviewRound: round }, userId },
      create: { userId, questionId, reviewRound: round, url: url.toString() },
      update: { url: url.toString(), deletedAt: null },
    });
    return { reviewRound: link.reviewRound, url: link.url, createdAt: link.createdAt, updatedAt: link.updatedAt, currentRound: current };
  }

  async remove(userId: string, questionId: string, round: number) {
    const r = await this.prisma.llmAnswerLink.updateMany({ where: { userId, questionId, reviewRound: round, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) throw ApiError.notFound('LLM answer link');
    return { questionId, reviewRound: round, deleted: true };
  }

  async preview(rawUrl: string) {
    const url = parsePublicUrl(rawUrl ?? '');
    if (!url) throw ApiError.badRequest('Enter a public http(s) link (no local or private addresses).');
    return this.previews.get(url.toString());
  }
}
