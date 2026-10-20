import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { FsrsService, serializeCard } from '../fsrs/fsrs.service';
import { CardStatus } from '../generated/prisma/client';
import { SettingsService } from '../settings/settings.service';
import { endOfDayInTz } from '../common/time';

/** Learner-driven card actions that sit outside FSRS rating: flag, suspend, bury, reset. */
@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsrs: FsrsService,
    private readonly settings: SettingsService,
  ) {}

  private async ensure(userId: string, questionId: string) {
    const q = await this.prisma.question.findFirst({ where: { id: questionId, userId, deletedAt: null }, select: { id: true } });
    if (!q) throw ApiError.notFound('Question', questionId);
    const now = new Date();
    return this.prisma.cardState.upsert({
      where: { questionId, userId },
      create: { userId, questionId, stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))), dueAt: now, status: CardStatus.NEW },
      update: {},
    });
  }

  async setFlag(userId: string, questionId: string, flagged: boolean) {
    await this.ensure(userId, questionId);
    return this.prisma.cardState.update({ where: { questionId, userId }, data: { flagged } });
  }

  async setSuspended(userId: string, questionId: string, suspended: boolean) {
    await this.ensure(userId, questionId);
    return this.prisma.cardState.update({ where: { questionId, userId }, data: { suspended } });
  }

  /** Hide until the start of tomorrow (learner's timezone). */
  async bury(userId: string, questionId: string) {
    await this.ensure(userId, questionId);
    const settings = await this.settings.get(userId);
    const until = endOfDayInTz(new Date(), settings.timezone);
    return this.prisma.cardState.update({ where: { questionId, userId }, data: { buriedUntil: until } });
  }

  async unbury(userId: string, questionId: string) {
    await this.ensure(userId, questionId);
    return this.prisma.cardState.update({ where: { questionId, userId }, data: { buriedUntil: null } });
  }

  /** Forget scheduling (card becomes NEW). Review history is preserved; the round counter continues. */
  async reset(userId: string, questionId: string) {
    const card = await this.ensure(userId, questionId);
    const now = new Date();
    return this.prisma.cardState.update({
      where: { questionId, userId },
      data: {
        stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))),
        dueAt: now,
        status: CardStatus.NEW,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        lastReviewAt: null,
        buriedUntil: null,
        version: card.version + 1,
      },
    });
  }

  async bulk(userId: string, questionIds: string[], action: 'flag' | 'unflag' | 'suspend' | 'resume' | 'bury' | 'unbury' | 'reset') {
    const results = [];
    for (const id of questionIds) {
      switch (action) {
        case 'flag': results.push(await this.setFlag(userId, id, true)); break;
        case 'unflag': results.push(await this.setFlag(userId, id, false)); break;
        case 'suspend': results.push(await this.setSuspended(userId, id, true)); break;
        case 'resume': results.push(await this.setSuspended(userId, id, false)); break;
        case 'bury': results.push(await this.bury(userId, id)); break;
        case 'unbury': results.push(await this.unbury(userId, id)); break;
        case 'reset': results.push(await this.reset(userId, id)); break;
      }
    }
    return { action, count: results.length };
  }
}
