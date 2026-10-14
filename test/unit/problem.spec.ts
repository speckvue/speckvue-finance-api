import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import ProblemFilter from '../../src/common/filters/problem.filter';

describe('safe error normalization', () => {
  const response = () => {
    const res = { status: jest.fn(), type: jest.fn(), send: jest.fn() };
    res.status.mockReturnValue(res);
    res.type.mockReturnValue(res);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'request-id' }),
        getResponse: () => res,
      }),
    } as unknown as ArgumentsHost;
    return { res, host };
  };

  test('omits rejected values and internal details from validation errors', () => {
    const { res, host } = response();
    new ProblemFilter().catch(
      new BadRequestException(['secret rejected field']),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        detail: 'The request contains invalid fields.',
        requestId: 'request-id',
      }),
    );
  });

  test('normalizes malformed JSON and oversized body errors', () => {
    const syntax = response();
    new ProblemFilter().catch(
      Object.assign(new SyntaxError('sensitive body'), { status: 400 }),
      syntax.host,
    );
    expect(syntax.res.status).toHaveBeenCalledWith(400);
    const large = response();
    new ProblemFilter().catch(
      Object.assign(new Error('body'), { type: 'entity.too.large' }),
      large.host,
    );
    expect(large.res.status).toHaveBeenCalledWith(413);
  });
});
