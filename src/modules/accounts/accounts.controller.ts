import {
  Body,
  Controller,
  Delete,
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
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import ApiProblems from '../../common/decorators/api-problems';
import IdempotencyKey from '../../common/decorators/idempotency-key';
import type { ApiRequest } from '../../common/types/http';
import {
  AccountPageResponse,
  AccountResponse,
  CreateAccountDto,
  ListAccountsDto,
  RenameAccountDto,
} from './accounts.dto';
import AccountsService from './accounts.service';

@ApiProblems()
@ApiTags('Accounts')
@ApiCookieAuth('session')
@Controller('accounts')
class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiCreatedResponse({ type: AccountResponse })
  create(
    @Req() req: ApiRequest,
    @Body() dto: CreateAccountDto,
    @IdempotencyKey(new ParseUUIDPipe({ version: '4' }))
    key: string,
  ) {
    return this.accounts.create(req.identity!.userId, dto, key);
  }

  @Get()
  @ApiOkResponse({ type: AccountPageResponse })
  list(@Req() req: ApiRequest, @Query() query: ListAccountsDto) {
    return this.accounts.list(req.identity!.userId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountResponse })
  read(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.accounts.read(req.identity!.userId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AccountResponse })
  rename(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RenameAccountDto,
  ) {
    return this.accounts.rename(req.identity!.userId, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  archive(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.accounts.archive(req.identity!.userId, id);
  }
}

export default AccountsController;
