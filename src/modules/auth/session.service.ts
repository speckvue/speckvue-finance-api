import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Identity } from '../../common/types/http';
import SettingsService from '../../config/settings.service';
import PrismaService from '../../database/prisma.service';

@Injectable()
class SessionService {
  constructor(
    private readonly db: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  digest(token: string): string {
    return createHmac('sha256', this.settings.get('SESSION_SECRET'))
      .update(token)
      .digest('hex');
  }

  csrf(token: string): string {
    return createHmac('sha256', this.settings.get('SESSION_SECRET'))
      .update('csrf:' + token)
      .digest('base64url');
  }

  validCsrf(token: string, provided: unknown): boolean {
    if (typeof provided !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(provided))
      return false;
    return timingSafeEqual(
      Buffer.from(this.csrf(token)),
      Buffer.from(provided),
    );
  }

  async create(
    userId: string,
    previous?: string,
    credentialsVersion = 0,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.$transaction(async (tx) => {
      if (previous)
        await tx.session.deleteMany({
          where: { tokenHash: this.digest(previous) },
        });
      await tx.session.deleteMany({
        where: { userId, expiresAt: { lte: new Date() } },
      });
      await tx.session.create({
        data: {
          userId,
          credentialsVersion,
          tokenHash: this.digest(token),
          expiresAt: new Date(
            Date.now() + this.settings.get('SESSION_TTL_SECONDS') * 1000,
          ),
        },
      });
    });
    return token;
  }

  async resolve(token: string | undefined): Promise<Identity | undefined> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const record = await this.db.session.findUnique({
      where: { tokenHash: this.digest(token) },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        credentialsVersion: true,
        user: { select: { credentialsVersion: true } },
      },
    });
    if (
      !record ||
      record.expiresAt <= new Date() ||
      record.credentialsVersion !== record.user.credentialsVersion
    )
      return undefined;
    return {
      userId: record.userId,
      sessionId: record.id,
      tokenHash: record.tokenHash,
    };
  }

  async invalidate(sessionId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { id: sessionId } });
  }
  async list(userId: string, sessionId: string) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { credentialsVersion: true },
    });
    const sessions = await this.db.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        credentialsVersion: user.credentialsVersion,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, createdAt: true, expiresAt: true },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === sessionId,
    }));
  }
  async invalidateAll(userId: string) {
    await this.db.user.update({
      where: { id: userId },
      data: {
        credentialsVersion: { increment: 1 },
        sessions: { deleteMany: {} },
      },
    });
  }
  async revoke(userId: string, sessionId: string) {
    return this.db.session.deleteMany({ where: { id: sessionId, userId } });
  }
}

export default SessionService;
