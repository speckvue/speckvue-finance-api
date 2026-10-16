import AppLogger from '../../src/common/logging/app-logger.service';
import PrismaService from '../../src/database/prisma.service';
import AccountsService from '../../src/modules/accounts/accounts.service';

describe('account local calendar rules', () => {
  afterEach(() => jest.useRealTimers());
  test.each([
    ['Asia/Kolkata', '2026-10-17'],
    ['America/Los_Angeles', '2026-10-16'],
    [null, '2026-10-16'],
  ])('uses %s rather than the server timezone', async (timezone, today) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-16T20:00:00Z'));
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue({ timezone }) },
    };
    const service = new AccountsService(
      db as unknown as PrismaService,
      {} as AppLogger,
    );
    expect((await service.options('owner')).today).toBe(today);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'owner' },
      select: { timezone: true },
    });
  });
});
