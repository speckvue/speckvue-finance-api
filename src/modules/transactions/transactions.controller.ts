import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import ApiProblems from '../../common/decorators/api-problems';
import type { ApiRequest } from '../../common/types/http';
import {
  TransactionCreateInput,
  TransactionDeleteInput,
  TransactionHistoryQuery,
  TransactionHistoryResponse,
  TransactionResponse,
  TransactionsQuery,
  TransactionsResponse,
  TransactionUpdateInput,
} from './transactions.dto';
import TransactionsService from './transactions.service';

@ApiProblems()
@ApiTags('Transactions')
@ApiCookieAuth('session')
@Controller('transactions')
class TransactionsController {
  constructor(private readonly service: TransactionsService) {}
  @Get()
  @ApiOkResponse({ type: TransactionsResponse })
  @ApiOperation({
    summary: 'List owned posted or deleted manual transactions, 50 per page',
  })
  list(@Req() req: ApiRequest, @Query() query: TransactionsQuery) {
    return this.service.list(req.identity!.userId, query);
  }
  @Get(':id/history')
  @ApiOkResponse({ type: TransactionHistoryResponse })
  @ApiOperation({ summary: 'Read immutable revision snapshots, newest first' })
  history(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TransactionHistoryQuery,
  ) {
    return this.service.history(req.identity!.userId, id, query.before);
  }
  @Get(':id')
  @ApiOkResponse({ type: TransactionResponse })
  get(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.identity!.userId, id);
  }
  @Post()
  @ApiCreatedResponse({ type: TransactionResponse })
  create(@Req() req: ApiRequest, @Body() dto: TransactionCreateInput) {
    return this.service.create(req.identity!.userId, dto);
  }
  @Patch(':id')
  @ApiOkResponse({ type: TransactionResponse })
  update(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransactionUpdateInput,
  ) {
    return this.service.update(req.identity!.userId, id, dto);
  }
  @Delete(':id')
  @ApiOkResponse({ type: TransactionResponse })
  remove(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransactionDeleteInput,
  ) {
    return this.service.remove(req.identity!.userId, id, dto.revision);
  }
}
export default TransactionsController;
