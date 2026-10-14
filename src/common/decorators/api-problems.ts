import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import ProblemResponse from '../dto/problem.dto';

const ApiProblems = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 413, 429, 500, 503].map((status) =>
      ApiResponse({
        status,
        type: ProblemResponse,
        description: 'Safe Problem Details response',
      }),
    ),
  );

export default ApiProblems;
