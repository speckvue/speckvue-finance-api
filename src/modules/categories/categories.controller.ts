import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  CategoriesResponse,
  CategoryInput,
  CategoryMoveInput,
  CategoryResponse,
} from './categories.dto';
import CategoriesService from './categories.service';

@ApiProblems()
@ApiTags('Categories')
@ApiCookieAuth('session')
@Controller('categories')
class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get()
  @ApiOkResponse({ type: CategoriesResponse })
  list(@Req() req: ApiRequest) {
    return this.categories.list(req.identity!.userId);
  }
  @Get(':id')
  @ApiOkResponse({ type: CategoryResponse })
  get(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.get(req.identity!.userId, id);
  }
  @Post()
  @ApiCreatedResponse({ type: CategoriesResponse })
  create(@Req() req: ApiRequest, @Body() dto: CategoryInput) {
    return this.categories.create(req.identity!.userId, dto);
  }
  @Patch(':id')
  @ApiOkResponse({ type: CategoriesResponse })
  update(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryInput,
  ) {
    return this.categories.update(req.identity!.userId, id, dto);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: CategoriesResponse })
  archive(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.archive(req.identity!.userId, id, true);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: CategoriesResponse })
  restore(@Req() req: ApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.archive(req.identity!.userId, id, false);
  }
  @Post(':id/move')
  @HttpCode(200)
  @ApiOkResponse({ type: CategoriesResponse })
  move(
    @Req() req: ApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryMoveInput,
  ) {
    return this.categories.move(req.identity!.userId, id, dto.direction);
  }
}
export default CategoriesController;
