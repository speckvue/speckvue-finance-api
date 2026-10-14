import { ValidationPipe } from '@nestjs/common';
import { SignupDto } from '../../src/modules/auth/auth.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('request validation', () => {
  test('rejects injected ownership fields', async () => {
    await expect(
      pipe.transform(
        {
          email: 'person@test.invalid',
          password: 'long-enough-password',
          userId: 'someone-else',
        },
        { type: 'body', metatype: SignupDto },
      ),
    ).rejects.toThrow();
  });
  test('rejects invalid credentials', async () => {
    await expect(
      pipe.transform(
        { email: 'invalid', password: 'short' },
        { type: 'body', metatype: SignupDto },
      ),
    ).rejects.toThrow();
  });
  test('normalizes valid email addresses', async () => {
    const result = await pipe.transform(
      { email: ' Person@Test.Invalid ', password: 'long-enough-password' },
      { type: 'body', metatype: SignupDto },
    );
    expect(result.email).toBe('person@test.invalid');
  });
});
