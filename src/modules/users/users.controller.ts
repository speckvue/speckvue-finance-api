import { Controller, Get, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import ApiProblems from '../../common/decorators/api-problems';
import type { ApiRequest } from '../../common/types/http';
import { UserResponse } from './users.dto';
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
}

export default UsersController;
