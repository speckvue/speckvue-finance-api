import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import ApiProblems from '../../common/decorators/api-problems';
import Public from '../../common/decorators/public';
import AppLogger from '../../common/logging/app-logger.service';
import type { ApiRequest } from '../../common/types/http';
import SettingsService from '../../config/settings.service';
import {
  AuthStatusResponse,
  CsrfResponse,
  SigninDto,
  SignupDto,
} from './auth.dto';
import AuthService from './auth.service';
import SessionService from './session.service';

@ApiProblems()
@ApiTags('Authentication')
@Controller('auth')
class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
    private readonly logger: AppLogger,
  ) {}

  @Public()
  @Post('signup')
  @ApiCreatedResponse({ type: AuthStatusResponse })
  async signup(@Body() dto: SignupDto) {
    await this.auth.signup(dto);
    return { message: 'Signup request accepted.' };
  }

  @Public()
  @Post('signin')
  @HttpCode(200)
  @ApiOkResponse({ type: CsrfResponse })
  async signin(
    @Body() dto: SigninDto,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.auth.signin(dto);
    const token = await this.sessions.create(
      userId,
      req.cookies[this.settings.get('SESSION_COOKIE_NAME')],
    );
    res.cookie(this.settings.get('SESSION_COOKIE_NAME'), token, {
      ...this.cookieOptions(),
      maxAge: this.settings.get('SESSION_TTL_SECONDS') * 1000,
    });
    return { csrfToken: this.sessions.csrf(token) };
  }

  @Get('csrf')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: CsrfResponse })
  csrf(@Req() req: ApiRequest) {
    return {
      csrfToken: this.sessions.csrf(
        req.cookies[this.settings.get('SESSION_COOKIE_NAME')]!,
      ),
    };
  }

  @Post('signout')
  @HttpCode(204)
  @ApiCookieAuth('session')
  @ApiNoContentResponse()
  async signout(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.invalidate(req.identity!.sessionId);
    this.logger.info('Authentication audit', { event: 'signout_succeeded' });
    res.clearCookie(
      this.settings.get('SESSION_COOKIE_NAME'),
      this.cookieOptions(),
    );
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.settings.get('COOKIE_SECURE'),
      sameSite: this.settings.get('COOKIE_SAME_SITE'),
      path: '/' + this.settings.get('API_PREFIX'),
    };
  }
}

export default AuthController;
