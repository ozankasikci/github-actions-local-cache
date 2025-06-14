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
exports.getInputs = getInputs;
exports.validateInputs = validateInputs;
exports.getDefaultCacheDir = getDefaultCacheDir;
exports.getCacheDir = getCacheDir;
exports.logInputs = logInputs;
exports.generateFileChecksum = generateFileChecksum;
exports.saveChecksum = saveChecksum;
exports.verifyChecksum = verifyChecksum;
const core = __importStar(require("@actions/core"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const logger_1 = require("./logger");
function getInputs() {
    const paths = core.getInput('path', { required: true });
    const primaryKey = core.getInput('key', { required: true });
    const restoreKeys = core.getInput('restore-keys');
    const uploadChunkSize = core.getInput('upload-chunk-size');
    const enableCrossOsArchive = core.getInput('enableCrossOsArchive') === 'true';
    const cacheDir = core.getInput('cache-dir');
    const lockTimeout = core.getInput('lock-timeout');
    const pathsArray = paths
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    if (pathsArray.length === 0) {
        throw new Error('At least one path must be specified');
    }
    if (!primaryKey.trim()) {
        throw new Error('Cache key cannot be empty');
    }
    const restoreKeysArray = restoreKeys
        ? restoreKeys
            .split('\n')
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
        : undefined;
    return {
        paths: pathsArray,
        primaryKey: primaryKey.trim(),
        restoreKeys: restoreKeysArray,
        uploadChunkSize: uploadChunkSize ? parseInt(uploadChunkSize, 10) : undefined,
        enableCrossOsArchive,
        cacheDir: cacheDir.trim() || undefined,
        lockTimeout: lockTimeout ? parseInt(lockTimeout, 10) : 60, // Default 60 seconds
    };
}
function validateInputs(inputs) {
    if (inputs.uploadChunkSize !== undefined && inputs.uploadChunkSize <= 0) {
        throw new Error('Upload chunk size must be a positive number');
    }
    if (inputs.lockTimeout !== undefined && inputs.lockTimeout <= 0) {
        throw new Error('Lock timeout must be a positive number');
    }
    for (const path of inputs.paths) {
        if (path.includes('..')) {
            throw new Error(`Invalid path: ${path}. Paths cannot contain '..'`);
        }
    }
}
function getDefaultCacheDir() {
    // Use user's cache directory instead of temp directory
    // This persists across runner jobs and system restarts
    const homeDir = os.homedir();
    return path.join(homeDir, '.cache', 'github-actions-local-cache');
}
function getCacheDir(inputs) {
    return inputs.cacheDir || getDefaultCacheDir();
}
function logInputs(inputs) {
    core.info(`Cache key: ${inputs.primaryKey}`);
    core.info(`Cache paths: ${inputs.paths.join(', ')}`);
    if (inputs.restoreKeys && inputs.restoreKeys.length > 0) {
        core.info(`Restore keys: ${inputs.restoreKeys.join(', ')}`);
    }
    if (inputs.uploadChunkSize) {
        core.info(`Upload chunk size: ${inputs.uploadChunkSize} bytes`);
    }
    if (inputs.enableCrossOsArchive) {
        core.info('Cross-OS archive enabled');
    }
    if (inputs.lockTimeout !== undefined) {
        core.info(`Lock timeout: ${inputs.lockTimeout} seconds`);
    }
    const cacheDir = getCacheDir(inputs);
    core.info(`Cache directory: ${cacheDir}`);
}
/**
 * Generate SHA-256 checksum of a file
 */
async function generateFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}
/**
 * Save checksum to a file alongside the cache file
 */
async function saveChecksum(cacheFile, checksum) {
    const checksumFile = `${cacheFile}.sha256`;
    await fs.promises.writeFile(checksumFile, `${checksum}  ${path.basename(cacheFile)}\n`);
    logger_1.logger.checksum(`Saved checksum to: ${checksumFile}`);
}
/**
 * Load and verify checksum from file
 */
async function verifyChecksum(cacheFile) {
    const checksumFile = `${cacheFile}.sha256`;
    if (!fs.existsSync(checksumFile)) {
        logger_1.logger.warning(`Checksum file not found: ${checksumFile}`, 'CHECKSUM');
        return false;
    }
    try {
        const checksumContent = await fs.promises.readFile(checksumFile, 'utf8');
        const expectedChecksum = checksumContent.split(' ')[0]?.trim();
        logger_1.logger.checksum(`Verifying checksum for: ${cacheFile}`);
        const actualChecksum = await generateFileChecksum(cacheFile);
        if (expectedChecksum && expectedChecksum === actualChecksum) {
            logger_1.logger.success('✅ Checksum verification passed', 'CHECKSUM');
            return true;
        }
        else {
            logger_1.logger.warning('❌ Checksum verification failed', 'CHECKSUM');
            logger_1.logger.warning(`Expected: ${expectedChecksum}`, 'CHECKSUM');
            logger_1.logger.warning(`Actual: ${actualChecksum}`, 'CHECKSUM');
            return false;
        }
    }
    catch (error) {
        logger_1.logger.warning(`Failed to verify checksum: ${error}`, 'CHECKSUM');
        return false;
    }
}
//# sourceMappingURL=utils.js.map