import { ValidationPipe } from '@nestjs/common';
import { CreateAccountDto } from '../../src/modules/accounts/accounts.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('request validation', () => {
  test('rejects client ownership identifiers', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Cash',
          currency: 'USD',
          openingBalance: '0',
          userId: 'someone-else',
        },
        { type: 'body', metatype: CreateAccountDto },
      ),
    ).rejects.toThrow();
  });
  test('rejects numeric monetary amounts', async () => {
    await expect(
      pipe.transform(
        { name: 'Cash', currency: 'USD', openingBalance: 0.1 },
        { type: 'body', metatype: CreateAccountDto },
      ),
    ).rejects.toThrow();
  });
  test('accepts explicit decimal strings', async () => {
    await expect(
      pipe.transform(
        { name: 'Cash', currency: 'USD', openingBalance: '0.1000' },
        { type: 'body', metatype: CreateAccountDto },
      ),
    ).resolves.toBeInstanceOf(CreateAccountDto);
  });
});
