import {
  Injectable,
  type LoggerService,
  type OnApplicationShutdown,
} from '@nestjs/common';
import SettingsService from '../../config/settings.service';
import createLogger, { closeLogger } from './create-logger';

@Injectable()
export default class AppLogger implements LoggerService, OnApplicationShutdown {
  private readonly instance;
  private closing?: Promise<void>;
  constructor(settings: SettingsService) {
    this.instance = createLogger({
      service: 'speckvue-finance-api',
      level: settings.get('LOG_LEVEL'),
      directory: settings.get('LOG_DIRECTORY'),
      fileEnabled: settings.get('LOG_FILE_ENABLED'),
      maxSize: settings.get('LOG_MAX_SIZE'),
      maxFiles: settings.get('LOG_MAX_FILES'),
    });
  }
  info(message: string, metadata: Record<string, unknown> = {}): void {
    this.instance.info(message, metadata);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }
  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }
  private write(level: string, message: unknown, params: unknown[]): void {
    const metadata =
      params[0] && typeof params[0] === 'object'
        ? (params[0] as Record<string, unknown>)
        : {
            context:
              typeof params.at(-1) === 'string' ? params.at(-1) : undefined,
          };
    this.instance.log(
      level,
      typeof message === 'string' ? message : 'Application event',
      metadata,
    );
  }
  onApplicationShutdown(): Promise<void> {
    this.closing ??= closeLogger(this.instance);
    return this.closing;
  }
}
