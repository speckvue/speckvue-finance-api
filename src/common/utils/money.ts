import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

const money = (value: string): Prisma.Decimal => {
  if (!/^-?(0|[1-9]\d{0,15})(\.\d{1,4})?$/.test(value))
    throw new BadRequestException('Invalid decimal amount');
  return new Prisma.Decimal(value);
};

export default money;
