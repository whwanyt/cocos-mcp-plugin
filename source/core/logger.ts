import { Logger } from '../types';

// EN: Minimal logger adapter keeps core code independent from Cocos-specific logging APIs.
// ZH: 轻量日志适配器让 core 代码不依赖 Cocos 专有日志 API。
export class ConsoleLogger implements Logger {
  constructor(private readonly scope: string) {}

  debug(message: string, meta?: unknown): void {
    console.debug(this.format(message), meta ?? '');
  }

  info(message: string, meta?: unknown): void {
    console.info(this.format(message), meta ?? '');
  }

  warn(message: string, meta?: unknown): void {
    console.warn(this.format(message), meta ?? '');
  }

  error(message: string, meta?: unknown): void {
    console.error(this.format(message), meta ?? '');
  }

  private format(message: string): string {
    return `[${this.scope}] ${message}`;
  }
}
