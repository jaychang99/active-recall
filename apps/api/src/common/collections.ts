import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export interface CollectionListOptions { archived?: boolean; includeArchived?: boolean }

export function archiveFilter(opts: CollectionListOptions) {
  return opts.includeArchived ? {} : { archivedAt: opts.archived ? { not: null } : null };
}

export function recentReviewsFirst<T extends { id: string; lastReviewedAt: Date | null; createdAt: Date }>(items: T[]): T[] {
  return items.sort((a, b) => {
    if (a.lastReviewedAt && b.lastReviewedAt) {
      const diff = b.lastReviewedAt.getTime() - a.lastReviewedAt.getTime();
      if (diff) return diff;
    } else if (a.lastReviewedAt) return -1;
    else if (b.lastReviewedAt) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  });
}

/** Review history survives a schedule reset; undone/deleted reviews do not count. */
export async function latestReviewsByQuestion(userId: string, prisma: PrismaService, question: Prisma.QuestionWhereInput) {
  const rows = await prisma.reviewLog.groupBy({
    by: ['questionId'],
    where: { userId, deletedAt: null, undone: false, question: { ...question, userId, deletedAt: null } },
    _max: { reviewedAt: true },
  });
  return new Map(rows.map((row) => [row.questionId, row._max.reviewedAt]));
}

/** Default all-decks study: retain unlabelled questions and questions with any active subject. */
export function activeCollectionQuestions(): Prisma.QuestionWhereInput {
  return {
    deck: { deletedAt: null, archivedAt: null },
    OR: [
      { subjects: { none: { deletedAt: null, subject: { deletedAt: null } } } },
      { subjects: { some: { deletedAt: null, subject: { deletedAt: null, archivedAt: null } } } },
    ],
  };
}
