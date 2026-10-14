import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import SettingsService from '../../config/settings.service';
import SessionService from '../../modules/auth/session.service';
import type { ApiRequest } from '../types/http';

@Injectable()
class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>('speckvue.public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const identity = await this.sessions.resolve(
      request.cookies[this.settings.get('SESSION_COOKIE_NAME')],
    );
    if (!identity) throw new UnauthorizedException('Authentication required');
    request.identity = identity;
    return true;
  }
}

export default SessionGuard;
