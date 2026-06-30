import { Service } from '@angular/core';
import { Logger } from 'tslog';

/**
 * Application logger backed by tslog. Exposes every tslog level; everything
 * that needs to log injects this service rather than touching tslog directly,
 * so transport/format settings live in one place.
 */
@Service()
export class LogService {
  private readonly logger = new Logger({ name: 'product-wizard' });

  silly(...args: unknown[]): void {
    this.logger.silly(...args);
  }

  trace(...args: unknown[]): void {
    this.logger.trace(...args);
  }

  debug(...args: unknown[]): void {
    this.logger.debug(...args);
  }

  info(...args: unknown[]): void {
    this.logger.info(...args);
  }

  warn(...args: unknown[]): void {
    this.logger.warn(...args);
  }

  error(...args: unknown[]): void {
    this.logger.error(...args);
  }

  fatal(...args: unknown[]): void {
    this.logger.fatal(...args);
  }
}
