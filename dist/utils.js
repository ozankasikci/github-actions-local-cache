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
exports.logInputs = logInputs;
const core = __importStar(require("@actions/core"));
function getInputs() {
    const paths = core.getInput('path', { required: true });
    const primaryKey = core.getInput('key', { required: true });
    const restoreKeys = core.getInput('restore-keys');
    const uploadChunkSize = core.getInput('upload-chunk-size');
    const enableCrossOsArchive = core.getInput('enableCrossOsArchive') === 'true';
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
    };
}
function validateInputs(inputs) {
    if (inputs.uploadChunkSize !== undefined && inputs.uploadChunkSize <= 0) {
        throw new Error('Upload chunk size must be a positive number');
    }
    for (const path of inputs.paths) {
        if (path.includes('..')) {
            throw new Error(`Invalid path: ${path}. Paths cannot contain '..'`);
        }
    }
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
}
//# sourceMappingURL=utils.js.map