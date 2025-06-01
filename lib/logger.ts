import * as core from '@actions/core';

// ANSI color codes for terminal colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Standard colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Bright colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

// Emoji and symbols for different log levels
const symbols = {
  info: '🔹',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  debug: '🔍',
  cache: '💾',
  lock: '🔒',
  checksum: '🔐',
  timer: '⏱️',
  archive: '📦',
  cleanup: '🧹',
  network: '🌐',
};

interface LogLevel {
  symbol: string;
  color: string;
  bgColor?: string;
  coreMethod: (message: string) => void;
}

const logLevels: Record<string, LogLevel> = {
  info: {
    symbol: symbols.info,
    color: colors.brightBlue,
    coreMethod: core.info,
  },
  success: {
    symbol: symbols.success,
    color: colors.brightGreen,
    coreMethod: core.info,
  },
  warning: {
    symbol: symbols.warning,
    color: colors.brightYellow,
    coreMethod: core.warning,
  },
  error: {
    symbol: symbols.error,
    color: colors.brightRed,
    coreMethod: core.error,
  },
  debug: {
    symbol: symbols.debug,
    color: colors.brightMagenta,
    coreMethod: core.debug,
  },
};

class Logger {
  private isGitHubActions: boolean;

  constructor() {
    // Detect if running in GitHub Actions environment
    this.isGitHubActions = !!process.env.GITHUB_ACTIONS;
  }

  private formatMessage(level: string, message: string, category?: string): string {
    const logLevel = logLevels[level];
    if (!logLevel) return message;

    const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
    const prefix = category ? `[${category}]` : '';

    if (this.isGitHubActions) {
      // For GitHub Actions, use simple format without ANSI colors
      return `${logLevel.symbol} ${prefix} ${message}`;
    } else {
      // For local development, use colorized format
      const coloredLevel = `${logLevel.color}${logLevel.symbol}${colors.reset}`;
      const coloredTime = `${colors.dim}${timestamp}${colors.reset}`;
      const coloredPrefix = prefix ? `${colors.cyan}${prefix}${colors.reset} ` : '';

      return `${coloredTime} ${coloredLevel} ${coloredPrefix}${message}`;
    }
  }

  private log(level: string, message: string, category?: string): void {
    const logLevel = logLevels[level];
    if (!logLevel) {
      console.log(message);
      return;
    }

    const formattedMessage = this.formatMessage(level, message, category);
    logLevel.coreMethod(formattedMessage);
  }

  // Basic log levels
  info(message: string, category?: string): void {
    this.log('info', message, category);
  }

  success(message: string, category?: string): void {
    this.log('success', message, category);
  }

  warning(message: string, category?: string): void {
    this.log('warning', message, category);
  }

  error(message: string, category?: string): void {
    this.log('error', message, category);
  }

  debug(message: string, category?: string): void {
    this.log('debug', message, category);
  }

  // Specialized logging methods for different operations
  cache(message: string): void {
    this.info(`${symbols.cache} ${message}`, 'CACHE');
  }

  lock(message: string): void {
    this.info(`${symbols.lock} ${message}`, 'LOCK');
  }

  checksum(message: string): void {
    this.info(`${symbols.checksum} ${message}`, 'CHECKSUM');
  }

  archive(message: string): void {
    this.info(`${symbols.archive} ${message}`, 'ARCHIVE');
  }

  cleanup(message: string): void {
    this.info(`${symbols.cleanup} ${message}`, 'CLEANUP');
  }

  timer(message: string, timeMs?: number): void {
    const timeStr = timeMs ? ` (${timeMs}ms)` : '';
    this.info(`${symbols.timer} ${message}${timeStr}`, 'TIMER');
  }

  // Utility methods for formatted output
  separator(title?: string): void {
    const line = '─'.repeat(50);
    if (title) {
      const paddedTitle = ` ${title} `;
      const titleLength = paddedTitle.length;
      const leftPadding = Math.floor((50 - titleLength) / 2);
      const rightPadding = 50 - titleLength - leftPadding;
      const formattedLine = '─'.repeat(leftPadding) + paddedTitle + '─'.repeat(rightPadding);
      this.info(formattedLine);
    } else {
      this.info(line);
    }
  }

  header(title: string): void {
    this.info('');
    this.separator(title.toUpperCase());
  }

  footer(): void {
    this.separator();
    this.info('');
  }

  // Progress and status indicators
  progress(message: string, current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    this.info(`${message} ${progressBar} ${current}/${total} (${percentage}%)`);
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  // File size formatting
  fileSize(message: string, sizeBytes: number): void {
    const formattedSize = this.formatBytes(sizeBytes);
    this.info(`${message} ${formattedSize}`);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  // Performance timing
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const elapsed = Date.now() - start;
      return elapsed;
    };
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };
