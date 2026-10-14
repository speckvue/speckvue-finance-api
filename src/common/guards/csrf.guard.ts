import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import SettingsService from '../../config/settings.service';
import SessionService from '../../modules/auth/session.service';
import type { ApiRequest } from '../types/http';

@Injectable()
class CsrfGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly sessions: SessionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ApiRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.headers.origin;
    if (
      !origin ||
      !this.settings
        .get('CORS_ORIGINS')
        .split(',')
        .map((v) => v.trim())
        .includes(origin)
    )
      throw new ForbiddenException('Untrusted request origin');
    if (req.identity) {
      const token = req.cookies[this.settings.get('SESSION_COOKIE_NAME')];
      if (
        !token ||
        !this.sessions.validCsrf(token, req.headers['x-csrf-token'])
      )
        throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}

export default CsrfGuard;
