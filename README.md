# Local Runner Cache

[![CI](https://github.com/ozankasikci/github-actions-local-cache/actions/workflows/ci.yml/badge.svg)](https://github.com/ozankasikci/github-actions-local-cache/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen.svg)](https://github.com/ozankasikci/github-actions-local-cache)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A GitHub Action for caching files and folders locally on the runner to speed up your workflows.

## Features

- Cache any files or directories
- Support for multiple cache paths
- Flexible cache key generation
- Cross-platform support
- Restore fallback keys

## Usage

### Basic Example

```yaml
- name: Cache dependencies
  uses: ozankasikci/github-actions-local-cache@v1
  with:
    path: |
      ~/.npm
      node_modules
    key: ${{ runner.os }}-deps-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-deps-
```

### Multiple Paths

```yaml
- name: Cache build artifacts
  uses: ozankasikci/github-actions-local-cache@v1
  with:
    path: |
      dist
      build
      .cache
      ~/.gradle/caches
    key: ${{ runner.os }}-build-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-build-
      ${{ runner.os }}-
```

### Advanced Usage

```yaml
- name: Cache with custom settings
  uses: ozankasikci/github-actions-local-cache@v1
  with:
    path: large-files/
    key: ${{ runner.os }}-large-${{ hashFiles('**/checksums.txt') }}
    restore-keys: ${{ runner.os }}-large-
    upload-chunk-size: 10485760  # 10MB chunks
    enableCrossOsArchive: true
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `path` | Files, directories, and wildcard patterns to cache | Yes | |
| `key` | Explicit key for restoring and saving the cache | Yes | |
| `restore-keys` | Ordered list of keys for restoring stale cache | No | |
| `upload-chunk-size` | Chunk size for splitting large files (bytes) | No | |
| `enableCrossOsArchive` | Allow cross-platform cache restore | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit` | Boolean indicating exact match for primary key |
| `cache-primary-key` | The key used to store the cache |
| `cache-matched-key` | The key of the cache that was restored |

## Examples by Language

### Node.js

```yaml
- name: Cache Node.js dependencies
  uses: ozankasikci/github-actions-local-cache@v1
  with:
    path: |
      ~/.npm
      node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### Python

```yaml
- name: Cache Python dependencies
  uses: ozankasikci/github-actions-local-cache@v1
  with:
    path: |
      ~/.cache/pip
      venv
    key: ${{ runner.os }}-python-${{ hashFiles('**/requirements.txt') }}
    restore-keys: |
      ${{ runner.os }}-python-
```

### Java/Gradle

```yaml
- name: Cache Gradle dependencies
  uses: ozankasikci/github-actions-local-cache@v1
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
    restore-keys: |
      ${{ runner.os }}-gradle-
```

## License

MIT