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
}

function pick(u: { id: string; provider: string; email: string; name: string | null; image: string | null }): AuthUser {
  return { id: u.id, provider: u.provider, email: u.email, name: u.name, image: u.image };
}
