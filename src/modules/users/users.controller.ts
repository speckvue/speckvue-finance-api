import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import ApiProblems from '../../common/decorators/api-problems';
import type { ApiRequest } from '../../common/types/http';
import { PreferencesDto, UserResponse } from './users.dto';
import UsersService from './users.service';

@ApiProblems()
@ApiTags('Users')
@ApiCookieAuth('session')
@Controller('users')
class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOkResponse({ type: UserResponse })
  profile(@Req() req: ApiRequest) {
    return this.users.profile(req.identity!.userId);
  }
  @Patch('me/preferences')
  @ApiOkResponse({ type: UserResponse })
  preferences(@Req() req: ApiRequest, @Body() dto: PreferencesDto) {
    return this.users.preferences(req.identity!.userId, dto);
  }
  @Post('me/onboarding')
  @HttpCode(200)
  @ApiOkResponse({ type: UserResponse })
  onboarding(@Req() req: ApiRequest, @Body() dto: PreferencesDto) {
    return this.users.preferences(req.identity!.userId, dto, true);
  }
}

export default UsersController;
