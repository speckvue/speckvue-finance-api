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
  ApiTags,
} from '@nestjs/swagger';
import ApiProblems from '../../common/decorators/api-problems';
import type { ApiRequest } from '../../common/types/http';
import {
  TransferCreateInput,
  TransferDeleteInput,
  TransferHistoryQuery,
  TransferHistoryResponse,
  TransferResponse,
  TransfersQuery,
  TransfersResponse,
  TransferUpdateInput,
} from './transfers.dto';
import TransfersService from './transfers.service';

@ApiProblems()
@ApiTags('Transfers')
@ApiCookieAuth('session')
@Controller('transfers')
class TransfersController {
  constructor(private readonly service: TransfersService) {}
  @Get()
  @ApiOkResponse({ type: TransfersResponse })
  list(@Req() req: ApiRequest, @Query() query: TransfersQuery) {
    return this.service.list(req.identity!.userId, query);
  }
  @Get(':id/history')
  @ApiOkResponse({ type: TransferHistoryResponse })
  history(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TransferHistoryQuery,
  ) {
    return this.service.history(req.identity!.userId, id, query.before);
  }
  @Get(':id')
  @ApiOkResponse({ type: TransferResponse })
  get(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.identity!.userId, id);
  }
  @Post()
  @ApiCreatedResponse({ type: TransferResponse })
  create(@Req() req: ApiRequest, @Body() dto: TransferCreateInput) {
    return this.service.create(req.identity!.userId, dto);
  }
  @Patch(':id')
  @ApiOkResponse({ type: TransferResponse })
  update(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferUpdateInput,
  ) {
    return this.service.update(req.identity!.userId, id, dto);
  }
  @Delete(':id')
  @ApiOkResponse({ type: TransferResponse })
  remove(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDeleteInput,
  ) {
    return this.service.remove(req.identity!.userId, id, dto.revision);
  }
}
export default TransfersController;
