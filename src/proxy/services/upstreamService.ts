import { WorkerEnv } from '../../env';

interface KeyState {
  key: string;
  cooldownUntil: number;
  failCount: number;
  successCount: number;
}

const keyStates: Map<string, KeyState> = new Map();
let roundRobinIndex = 0;

export function resetKeyPool(): void {
  keyStates.clear();
  roundRobinIndex = 0;
}

export function parseKeys(env: WorkerEnv): string[] {
  const raw = env.GEMINI_API_KEYS;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean);
    } catch {
      return raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function getOrCreateKeyState(key: string): KeyState {
  let state = keyStates.get(key);
  if (!state) {
    state = {
      key,
      cooldownUntil: 0,
      failCount: 0,
      successCount: 0,
    };
    keyStates.set(key, state);
  }
  return state;
}

export function getUpstreamKey(env: WorkerEnv): string | null {
  const keys = parseKeys(env);
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];

  const now = Date.now();
  const availableKeys = keys.filter(k => {
    const state = getOrCreateKeyState(k);
    return state.cooldownUntil <= now;
  });

  // If all keys are cooled down, pick the one that expires soonest
  const candidateKeys = availableKeys.length > 0 ? availableKeys : keys;

  const chosenKey = candidateKeys[roundRobinIndex % candidateKeys.length];
  roundRobinIndex++;
  return chosenKey;
}

export function recordKeyFailure(key: string, statusCode: number): void {
  const state = getOrCreateKeyState(key);
  state.failCount++;
  if (statusCode === 429 || statusCode >= 500) {
    // 60-second cooldown
    state.cooldownUntil = Date.now() + 60000;
  }
}

export function recordKeySuccess(key: string): void {
  const state = getOrCreateKeyState(key);
  state.successCount++;
  state.failCount = 0;
  state.cooldownUntil = 0;
}

export function getKeyStatesSummary(): KeyState[] {
  return Array.from(keyStates.values());
}

export async function fetchUpstream(
  url: string,
  init: RequestInit,
  timeoutMs: number = 180000,
  clientSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Upstream request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const onClientAbort = () => {
    controller.abort(new Error('Client aborted request'));
  };

  if (clientSignal) {
    if (clientSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      clientSignal.addEventListener('abort', onClientAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
    if (clientSignal) {
      clientSignal.removeEventListener('abort', onClientAbort);
    }
  }
}
