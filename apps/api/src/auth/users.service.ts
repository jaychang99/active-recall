import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ApiTokenClaims } from './token';

export interface AuthUser {
  id: string;
  provider: string;
  email: string;
  name: string | null;
  image: string | null;
}

const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Finds (or creates on first sign-in) the user behind a verified token. At most one write per hour per user. */
  async resolve(claims: ApiTokenClaims): Promise<AuthUser> {
    const key = { provider_providerSub: { provider: claims.provider, providerSub: claims.providerSub } };
    const existing = await this.prisma.user.findUnique({ where: key });
    const profile = { email: claims.email, name: claims.name ?? null, image: claims.picture ?? null };
    if (!existing) {
      try {
        const created = await this.prisma.user.create({ data: { provider: claims.provider, providerSub: claims.providerSub, ...profile, lastSeenAt: new Date() } });
        return pick(created);
      } catch (e) {
        // Two first requests racing: the other one won, read it back.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return pick(await this.prisma.user.findUniqueOrThrow({ where: key }));
        throw e;
      }
    }
    if (existing.deletedAt) await this.prisma.user.update({ where: key, data: { deletedAt: null } });
    const stale = !existing.lastSeenAt || Date.now() - existing.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS;
    const changed = existing.email !== profile.email || existing.name !== profile.name || existing.image !== profile.image;
    if (stale || changed) {
      const updated = await this.prisma.user.update({ where: key, data: { ...profile, lastSeenAt: new Date() } });
      return pick(updated);
    }
    return pick(existing);
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, provider: true, email: true, name: true, image: true, createdAt: true, lastSeenAt: true } });
  }

  /**
   * Permanently deletes the account and every row it owns, on the user's own request. This is the one
   * deliberate exception to soft delete: nothing is kept behind a `deletedAt`. Children go first so
   * foreign keys never dangle mid-way; every `where` carries `userId`, so the tenant guard still applies.
   */
  async deleteAccount(userId: string) {
    const counts: Record<string, number> = {};
    await this.prisma.$transaction(
      async (tx) => {
        counts.examResponses = (await tx.examResponse.deleteMany({ where: { userId } })).count;
        counts.exams = (await tx.examAttempt.deleteMany({ where: { userId } })).count;
        counts.practices = (await tx.practiceLog.deleteMany({ where: { userId } })).count;
        counts.notes = (await tx.questionNote.deleteMany({ where: { userId } })).count;
        counts.llmLinks = (await tx.llmAnswerLink.deleteMany({ where: { userId } })).count;
        counts.reviews = (await tx.reviewLog.deleteMany({ where: { userId } })).count;
        counts.sessions = (await tx.studySession.deleteMany({ where: { userId } })).count;
        counts.cards = (await tx.cardState.deleteMany({ where: { userId } })).count;
        counts.questionSubjects = (await tx.questionSubject.deleteMany({ where: { userId } })).count;
        counts.subjects = (await tx.subject.deleteMany({ where: { userId } })).count;
        counts.questions = (await tx.question.deleteMany({ where: { userId } })).count;
        counts.decks = (await tx.deck.deleteMany({ where: { userId } })).count;
        counts.settings = (await tx.appSettings.deleteMany({ where: { userId } })).count;
        counts.promptSnapshots = (await tx.promptSnapshot.deleteMany({ where: { userId } })).count;
        counts.shares = (await tx.share.deleteMany({ where: { userId } })).count;
        // Shares still waiting for this person are answered as declined, so senders see they will not arrive.
        const { email } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
        await tx.share.updateMany({ where: { recipientEmail: email.trim().toLowerCase(), status: 'pending' }, data: { status: 'declined', respondedAt: new Date() } });
        await tx.user.delete({ where: { id: userId } });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return { deleted: true, counts };
  }
}

function pick(u: { id: string; provider: string; email: string; name: string | null; image: string | null }): AuthUser {
  return { id: u.id, provider: u.provider, email: u.email, name: u.name, image: u.image };
}
