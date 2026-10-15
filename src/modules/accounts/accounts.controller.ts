import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import ApiProblems from '../../common/decorators/api-problems';
import type { ApiRequest } from '../../common/types/http';
import {
  AccountInput,
  AccountResponse,
  AccountsQuery,
  AccountsResponse,
} from './accounts.dto';
import AccountsService from './accounts.service';

@ApiProblems()
@ApiTags('Accounts')
@ApiCookieAuth('session')
@Controller('accounts')
class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOkResponse({ type: AccountsResponse })
  list(@Req() req: ApiRequest, @Query() query: AccountsQuery) {
    return this.accounts.list(req.identity!.userId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountResponse })
  get(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.get(req.identity!.userId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: AccountResponse })
  create(@Req() req: ApiRequest, @Body() dto: AccountInput) {
    return this.accounts.create(req.identity!.userId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AccountResponse })
  update(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountInput,
  ) {
    return this.accounts.update(req.identity!.userId, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountResponse })
  archive(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.archive(req.identity!.userId, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountResponse })
  restore(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.archive(req.identity!.userId, id, false);
  }
}
export default AccountsController;
