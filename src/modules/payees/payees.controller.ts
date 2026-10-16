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
  PayeeInput,
  PayeeMergeInput,
  PayeeResponse,
  PayeesQuery,
  PayeesResponse,
} from './payees.dto';
import PayeesService from './payees.service';

@ApiProblems()
@ApiTags('Payees')
@ApiCookieAuth('session')
@Controller('payees')
class PayeesController {
  constructor(private readonly payees: PayeesService) {}
  @Get()
  @ApiOkResponse({ type: PayeesResponse })
  list(@Req() req: ApiRequest, @Query() query: PayeesQuery) {
    return this.payees.list(req.identity!.userId, query);
  }
  @Get(':id')
  @ApiOkResponse({ type: PayeeResponse })
  get(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.payees.get(req.identity!.userId, id);
  }
  @Post()
  @ApiCreatedResponse({ type: PayeeResponse })
  create(@Req() req: ApiRequest, @Body() dto: PayeeInput) {
    return this.payees.create(req.identity!.userId, dto);
  }
  @Patch(':id')
  @ApiOkResponse({ type: PayeeResponse })
  update(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayeeInput,
  ) {
    return this.payees.update(req.identity!.userId, id, dto);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: PayeeResponse })
  archive(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.payees.archive(req.identity!.userId, id, true);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: PayeeResponse })
  restore(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.payees.archive(req.identity!.userId, id, false);
  }
  @Post(':id/merge')
  @HttpCode(200)
  @ApiOkResponse({ type: PayeeResponse })
  merge(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayeeMergeInput,
  ) {
    return this.payees.merge(req.identity!.userId, id, dto.targetId);
  }
}
export default PayeesController;
