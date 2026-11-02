export function normalizeTrackingCode(raw: string): string {
  return raw
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function normalizePinCode(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = `${err.name} ${err.message}`.toLowerCase();
  return (
    msg.includes('expected pattern') ||
    msg.includes('syntaxerror') ||
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('aborted')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SafeFetchOptions {
  retries?: number;
  fallbackError?: string;
}

export async function safeFetchJson<T>(
  url: string,
  init?: RequestInit,
  options?: SafeFetchOptions
): Promise<T> {
  const maxRetries = options?.retries ?? 2;
  const fallbackError =
    options?.fallbackError || 'Unable to complete request right now. Please try again.';

  const headers = new Headers(init?.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...init,
        headers,
      });

      const rawText = await resp.text();
      const trimmed = rawText.trim();

      const isGatewayStarting =
        resp.status === 502 ||
        resp.status === 503 ||
        resp.status === 504 ||
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<html') ||
        (trimmed.length === 0 && resp.status >= 500);

      if (isGatewayStarting) {
        if (attempt < maxRetries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw new Error(
          'Server is waking up after idle mode. Please wait a second and try again.'
        );
      }

      if (!trimmed) {
        throw new Error(fallbackError);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        if (attempt < maxRetries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw new Error(fallbackError);
      }

      if (!resp.ok) {
        const apiErr =
          parsed &&
          typeof parsed === 'object' &&
          'error' in parsed &&
          typeof (parsed as { error?: unknown }).error === 'string'
            ? (parsed as { error: string }).error
            : fallbackError;
        throw new Error(apiErr);
      }

      return parsed as T;
    } catch (err: unknown) {
      if (isTransientFetchError(err)) {
        if (attempt < maxRetries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        lastError = new Error(
          'Connection to server was interrupted while waking up. Please click again to retry.'
        );
      } else {
        lastError = err instanceof Error ? err : new Error(fallbackError);
        break;
      }
    }
  }

  throw lastError || new Error(fallbackError);
}
