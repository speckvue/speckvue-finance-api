import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ApiRequest } from '../types/http';

const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<ApiRequest>().headers['idempotency-key'],
);

export default IdempotencyKey;
