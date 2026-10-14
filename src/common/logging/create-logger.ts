import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export interface LoggerOptions {
  service: string;
  level: string;
  directory: string;
  fileEnabled: boolean;
  maxSize: string;
  maxFiles: string;
}

// Keep an allowlist so request bodies, credentials, and financial values cannot
// accidentally enter transport metadata. Callers supply fixed event messages.
const safeFields = new Set([
  'level',
  'message',
  'timestamp',
  'service',
  'event',
  'requestId',
  'method',
  'status',
  'durationMs',
  'port',
  'context',
  'errorType',
]);
const safeMetadata = winston.format((info) => {
  for (const key of Object.keys(info))
    if (!safeFields.has(key)) delete info[key];
  if (typeof info.message !== 'string') info.message = 'Application event';
  return info;
});

/** Creates JSON console logs and daily/size-limited archives with bounded retention. */
export default function createLogger(options: LoggerOptions): winston.Logger {
  const transports: winston.transport[] = [new winston.transports.Console()];
  if (options.fileEnabled && options.level !== 'silent') {
    mkdirSync(options.directory, { recursive: true, mode: 0o750 });
    for (const kind of ['application', 'error']) {
      const transport = new DailyRotateFile({
        dirname: options.directory,
        filename: options.service + '-' + kind + '-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        utc: true,
        zippedArchive: true,
        maxSize: options.maxSize,
        maxFiles: options.maxFiles,
        auditFile: join(
          options.directory,
          '.' + options.service + '-' + kind + '-audit.json',
        ),
        ...(kind === 'error' ? { level: 'error' } : {}),
      });
      transport.on('error', () =>
        process.stderr.write('Log transport failed.\n'),
      );
      transports.push(transport);
    }
  }
  const logger = winston.createLogger({
    level: options.level === 'silent' ? 'info' : options.level,
    silent: options.level === 'silent',
    format: winston.format.combine(
      winston.format.timestamp(),
      safeMetadata(),
      winston.format.json(),
    ),
    defaultMeta: { service: options.service },
    transports,
    exitOnError: false,
  });
  logger.on('error', () => process.stderr.write('Logger failed.\n'));
  return logger;
}

/** Drain Winston and rotating file streams before stopping the process. */
export async function closeLogger(logger: winston.Logger): Promise<void> {
  const rotatingFiles = logger.transports.filter(
    (transport): transport is DailyRotateFile =>
      transport instanceof DailyRotateFile,
  );
  const finished = once(logger, 'finish');
  logger.end();
  await finished;
  await Promise.all(
    rotatingFiles.map(
      (transport) =>
        new Promise<void>((resolve, reject) => {
          const stream = (transport as DailyRotateFile).logStream;
          stream.once('error', reject);
          stream.end(() => {
            stream.removeListener('error', reject);
            resolve();
          });
        }),
    ),
  );
  logger.close();
}
