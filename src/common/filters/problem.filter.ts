import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client';
import AppLogger from '../logging/app-logger.service';
import type { ApiRequest } from '../types/http';

@Catch()
class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger?: AppLogger) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<ApiRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let detail = 'An unexpected error occurred.';
    let code = 'INTERNAL_ERROR';
    if (
      error instanceof SyntaxError &&
      'status' in error &&
      error.status === 400
    ) {
      status = 400;
      detail = 'Malformed JSON body';
      code = 'VALIDATION_ERROR';
    }
    if (
      error instanceof Error &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      status = 413;
      detail = 'Request body too large';
      code = 'PAYLOAD_TOO_LARGE';
    }
    if (error instanceof HttpException) {
      status = error.getStatus();
      const payload = error.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : (payload as { message?: unknown }).message;
      detail =
        typeof message === 'string'
          ? message
          : status === 400
            ? 'The request contains invalid fields.'
            : (STATUS_CODES[status] ?? 'Request failed');
      code =
        status === 400
          ? 'VALIDATION_ERROR'
          : status === 401
            ? 'UNAUTHENTICATED'
            : status === 403
              ? 'FORBIDDEN'
              : status === 404
                ? 'NOT_FOUND'
                : status === 429
                  ? 'RATE_LIMITED'
                  : 'HTTP_ERROR';
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      status =
        error.code === 'P2002'
          ? 409
          : error.code === 'P2025'
            ? 404
            : error.code === 'P2003'
              ? 409
              : 503;
      detail =
        status === 409
          ? 'The operation conflicts with existing data.'
          : status === 404
            ? 'Resource not found.'
            : 'Service temporarily unavailable.';
      code =
        status === 409
          ? 'CONFLICT'
          : status === 404
            ? 'NOT_FOUND'
            : 'UNAVAILABLE';
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      status = 503;
      detail = 'Service temporarily unavailable.';
      code = 'UNAVAILABLE';
    }
    if (status >= 500) {
      detail =
        status === 503
          ? 'Service temporarily unavailable.'
          : 'An unexpected error occurred.';
      this.logger?.error('Request failed', {
        event: 'request_failed',
        requestId: req.id,
        status,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
    }
    res
      .status(status)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail,
        code,
        requestId: req.id,
      });
  }
}

export default ProblemFilter;
