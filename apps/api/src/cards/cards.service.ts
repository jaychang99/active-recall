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

  private async ensure(questionId: string) {
    const q = await this.prisma.question.findFirst({ where: { id: questionId, deletedAt: null }, select: { id: true } });
    if (!q) throw ApiError.notFound('Question', questionId);
    const now = new Date();
    return this.prisma.cardState.upsert({
      where: { questionId },
      create: { questionId, stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))), dueAt: now, status: CardStatus.NEW },
      update: {},
    });
  }

  async setFlag(questionId: string, flagged: boolean) {
    await this.ensure(questionId);
    return this.prisma.cardState.update({ where: { questionId }, data: { flagged } });
  }

  async setSuspended(questionId: string, suspended: boolean) {
    await this.ensure(questionId);
    return this.prisma.cardState.update({ where: { questionId }, data: { suspended } });
  }

  /** Hide until the start of tomorrow (learner's timezone). */
  async bury(questionId: string) {
    await this.ensure(questionId);
    const settings = await this.settings.get();
    const until = endOfDayInTz(new Date(), settings.timezone);
    return this.prisma.cardState.update({ where: { questionId }, data: { buriedUntil: until } });
  }

  async unbury(questionId: string) {
    await this.ensure(questionId);
    return this.prisma.cardState.update({ where: { questionId }, data: { buriedUntil: null } });
  }

  /** Forget scheduling (card becomes NEW). Review history is preserved; the round counter continues. */
  async reset(questionId: string) {
    const card = await this.ensure(questionId);
    const now = new Date();
    return this.prisma.cardState.update({
      where: { questionId },
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

  async bulk(questionIds: string[], action: 'flag' | 'unflag' | 'suspend' | 'resume' | 'bury' | 'unbury' | 'reset') {
    const results = [];
    for (const id of questionIds) {
      switch (action) {
        case 'flag': results.push(await this.setFlag(id, true)); break;
        case 'unflag': results.push(await this.setFlag(id, false)); break;
        case 'suspend': results.push(await this.setSuspended(id, true)); break;
        case 'resume': results.push(await this.setSuspended(id, false)); break;
        case 'bury': results.push(await this.bury(id)); break;
        case 'unbury': results.push(await this.unbury(id)); break;
        case 'reset': results.push(await this.reset(id)); break;
      }
    }
    return { action, count: results.length };
  }
}
