# Design Spec: Zero-Cache Dynamic Configuration Architecture

## Executive Summary
This design eliminates static configuration caching across the codebase to ensure that any runtime configuration mutation via `updateConfig()` propagates instantly across all services without requiring server restarts or manual module refreshes.

## Core Architectural Rules

### 1. Zero Top-Level Variable Binding Rule
No utility or service module may compute, cache, or assign properties derived from `config` at module load time (top-level scope) or inside class constructors.

### 2. Logger Refactoring (`src/utils/logger.ts`)
- Replaces static top-level `currentLevel` variable with a dynamic function `getCurrentLevel()` evaluated per `log()` invocation.
- Evaluates `config.logLevel` and `config.timeZone` dynamically on every log event.

### 3. Codebase Audit
Scans all files across `src/` to guarantee all config properties (`logLevel`, `timeZone`, `modelMappings`, `customSystemInstruction`, `systemRoleToInstruction`, `runtimeContextTag`, `upstreamTimeoutMs`) are accessed dynamically.
