import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import winston from 'winston';
import createLogger, {
  closeLogger,
} from '../../src/common/logging/create-logger';

test('rotates file logs and excludes sensitive metadata', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'speckvue-log-test-'));
  const logger = createLogger({
    service: 'test',
    level: 'info',
    directory,
    fileEnabled: true,
    maxSize: '1k',
    maxFiles: '2d',
  });
  for (const transport of logger.transports)
    if (transport instanceof winston.transports.Console)
      transport.silent = true;
  try {
    for (let index = 0; index < 40; index++)
      logger.info('Safe application event', {
        event: 'rotation_check',
        requestId: 'request-' + index,
        password: 'never-log-password',
        cookie: 'never-log-cookie',
        email: 'never-log@example.test',
        amount: '98765.4321',
      });
    await closeLogger(logger);
    const files = readdirSync(directory).filter(
      (file) => file.startsWith('test-application') && file.includes('.log'),
    );
    expect(files.length).toBeGreaterThan(1);
    const text = files
      .map((file) => readFileSync(join(directory, file), 'utf8'))
      .join('');
    expect(text).toContain('rotation_check');
    for (const sensitive of [
      'never-log-password',
      'never-log-cookie',
      'never-log@example.test',
      '98765.4321',
    ])
      expect(text).not.toContain(sensitive);
  } finally {
    logger.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
