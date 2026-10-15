import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import AppLogger from '../../common/logging/app-logger.service';
import PrismaService from '../../database/prisma.service';
import type { PreferencesDto } from './users.dto';

const profileSelect = {
  id: true,
  email: true,
  createdAt: true,
  displayName: true,
  baseCurrency: true,
  locale: true,
  timezone: true,
  theme: true,
  weekStartsOn: true,
  onboardedAt: true,
} as const;

@Injectable()
class UsersService {
  constructor(
    private readonly db: PrismaService,
    private readonly logger: AppLogger,
  ) {}
  credentials(email: string) {
    return this.db.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, credentialsVersion: true },
    });
  }
  async profile(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: profileSelect,
    });
    if (!user) throw new NotFoundException();
    return user;
  }
  async preferences(id: string, dto: PreferencesDto, onboarding = false) {
    const displayName = dto.displayName.trim();
    if (
      !displayName ||
      Array.from(displayName).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      throw new BadRequestException('Invalid display name');
    let locale: string;
    try {
      if (!Intl.supportedValuesOf('currency').includes(dto.baseCurrency))
        throw Error();
      if (!Intl.DateTimeFormat.supportedLocalesOf([dto.locale]).length)
        throw Error();
      locale = Intl.getCanonicalLocales(dto.locale)[0]!;
      new Intl.DateTimeFormat(locale, { timeZone: dto.timezone }).format();
    } catch {
      throw new BadRequestException('Unsupported currency, locale or timezone');
    }
    const saved = await this.db.$transaction(async (tx) => {
      if (onboarding)
        await tx.user.updateMany({
          where: { id, onboardedAt: null },
          data: { onboardedAt: new Date() },
        });
      return tx.user.update({
        where: { id },
        data: { ...dto, displayName, locale },
        select: profileSelect,
      });
    });
    this.logger.info('Preferences audit', {
      event: onboarding ? 'onboarding_saved' : 'preferences_saved',
    });
    return saved;
  }
}
export default UsersService;
