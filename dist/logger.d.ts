declare class Logger {
    private isGitHubActions;
    constructor();
    private formatMessage;
    private log;
    info(message: string, category?: string): void;
    success(message: string, category?: string): void;
    warning(message: string, category?: string): void;
    error(message: string, category?: string): void;
    debug(message: string, category?: string): void;
    cache(message: string): void;
    lock(message: string): void;
    checksum(message: string): void;
    archive(message: string): void;
    cleanup(message: string): void;
    timer(message: string, timeMs?: number): void;
    separator(title?: string): void;
    header(title: string): void;
    footer(): void;
    progress(message: string, current: number, total: number): void;
    private createProgressBar;
    fileSize(message: string, sizeBytes: number): void;
    private formatBytes;
    startTimer(): () => void;
}
export declare const logger: Logger;
export { Logger };
//# sourceMappingURL=logger.d.ts.map