import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import AppLogger from '../../common/logging/app-logger.service';
import SettingsService from '../../config/settings.service';
import PrismaService from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import UsersService from '../users/users.service';
import type { ChangePasswordDto, SigninDto, SignupDto } from './auth.dto';
import PasswordService from './password.service';

@Injectable()
class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly settings: SettingsService,
    private readonly logger: AppLogger,
  ) {}

  async signup(dto: SignupDto): Promise<void> {
    if (!this.settings.get('SIGNUP_ENABLED'))
      throw new ForbiddenException('Signup unavailable');
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      await this.db.user.create({ data: { email: dto.email, passwordHash } });
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ))
        throw error;
    }
    this.logger.info('Authentication audit', { event: 'signup_requested' });
  }

  async signin(dto: SigninDto) {
    const user = await this.users.credentials(dto.email);
    if (
      !(await this.passwords.verify(user?.passwordHash, dto.password)) ||
      !user
    ) {
      this.logger.warn('Authentication audit', { event: 'signin_failed' });
      throw new UnauthorizedException('Invalid email or password');
    }
    this.logger.info('Authentication audit', { event: 'signin_succeeded' });
    return user;
  }
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword)))
      throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, credentialsVersion: user.credentialsVersion },
        data: { passwordHash, credentialsVersion: { increment: 1 } },
      });
      if (!updated.count)
        throw new UnauthorizedException('Credentials changed; signin again');
      await tx.session.deleteMany({ where: { userId } });
    });
    this.logger.info('Authentication audit', { event: 'password_changed' });
  }
}

export default AuthService;
