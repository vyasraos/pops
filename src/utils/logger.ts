import chalk from 'chalk';
import type { LogLevel } from '../types';

class Logger {
  private logLevel: LogLevel = 'info';

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(chalk.red(`❌ ERROR: ${message}`), ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(chalk.yellow(`⚠️  WARN: ${message}`), ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(`ℹ️  INFO: ${message}`), ...args);
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray(`🐛 DEBUG: ${message}`), ...args);
    }
  }

  success(message: string, ...args: any[]) {
    console.log(chalk.green(`✅ ${message}`), ...args);
  }

  log(message: string, ...args: any[]) {
    console.log(message, ...args);
  }
}

export const logger = new Logger();
