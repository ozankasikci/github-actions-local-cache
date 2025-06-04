"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.logger = void 0;
const core = __importStar(require("@actions/core"));
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
const logLevels = {
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
    constructor() {
        // Detect if running in GitHub Actions environment
        this.isGitHubActions = !!process.env.GITHUB_ACTIONS;
    }
    formatMessage(level, message, category) {
        const logLevel = logLevels[level];
        if (!logLevel)
            return message;
        const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
        const prefix = category ? `[${category}]` : '';
        if (this.isGitHubActions) {
            // For GitHub Actions, use simple format without ANSI colors
            return `${logLevel.symbol} ${prefix} ${message}`;
        }
        else {
            // For local development, use colorized format
            const coloredLevel = `${logLevel.color}${logLevel.symbol}${colors.reset}`;
            const coloredTime = `${colors.dim}${timestamp}${colors.reset}`;
            const coloredPrefix = prefix ? `${colors.cyan}${prefix}${colors.reset} ` : '';
            return `${coloredTime} ${coloredLevel} ${coloredPrefix}${message}`;
        }
    }
    log(level, message, category) {
        const logLevel = logLevels[level];
        if (!logLevel) {
            console.log(message);
            return;
        }
        const formattedMessage = this.formatMessage(level, message, category);
        logLevel.coreMethod(formattedMessage);
    }
    // Basic log levels
    info(message, category) {
        this.log('info', message, category);
    }
    success(message, category) {
        this.log('success', message, category);
    }
    warning(message, category) {
        this.log('warning', message, category);
    }
    error(message, category) {
        this.log('error', message, category);
    }
    debug(message, category) {
        this.log('debug', message, category);
    }
    // Specialized logging methods for different operations
    cache(message) {
        this.info(`${symbols.cache} ${message}`, 'CACHE');
    }
    lock(message) {
        this.info(`${symbols.lock} ${message}`, 'LOCK');
    }
    checksum(message) {
        this.info(`${symbols.checksum} ${message}`, 'CHECKSUM');
    }
    archive(message) {
        this.info(`${symbols.archive} ${message}`, 'ARCHIVE');
    }
    cleanup(message) {
        this.info(`${symbols.cleanup} ${message}`, 'CLEANUP');
    }
    timer(message, timeMs) {
        const timeStr = timeMs ? ` (${timeMs}ms)` : '';
        this.info(`${symbols.timer} ${message}${timeStr}`, 'TIMER');
    }
    // Utility methods for formatted output
    separator(title) {
        const line = '─'.repeat(50);
        if (title) {
            const paddedTitle = ` ${title} `;
            const titleLength = paddedTitle.length;
            const leftPadding = Math.floor((50 - titleLength) / 2);
            const rightPadding = 50 - titleLength - leftPadding;
            const formattedLine = '─'.repeat(leftPadding) + paddedTitle + '─'.repeat(rightPadding);
            this.info(formattedLine);
        }
        else {
            this.info(line);
        }
    }
    header(title) {
        this.info('');
        this.separator(title.toUpperCase());
    }
    footer() {
        this.separator();
        this.info('');
    }
    // Progress and status indicators
    progress(message, current, total) {
        const percentage = Math.round((current / total) * 100);
        const progressBar = this.createProgressBar(percentage);
        this.info(`${message} ${progressBar} ${current}/${total} (${percentage}%)`);
    }
    createProgressBar(percentage, width = 20) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    }
    // File size formatting
    fileSize(message, sizeBytes) {
        const formattedSize = this.formatBytes(sizeBytes);
        this.info(`${message} ${formattedSize}`);
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
    // Performance timing
    startTimer() {
        const start = Date.now();
        return () => {
            const elapsed = Date.now() - start;
            return elapsed;
        };
    }
}
exports.Logger = Logger;
// Export singleton instance
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map