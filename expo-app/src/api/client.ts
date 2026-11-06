import type { JobKind, JobProgress, PickedFile, ServerConfig, SpotifyPreview } from './types';

/** An error the server reported (non-2xx), carrying its HTTP status. */
export class ServerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ServerError';
  }
}

/** Pick the filename out of a Content-Disposition header, preferring the UTF-8 `filename*` form. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Fall through to the plain filename.
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/.exec(header);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name || fallback;
}

export function createClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  async function request(path: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    let response: Response;
    // React Native's Android client has no connect timeout, so a wrong address would otherwise hang for minutes.
    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, controller ? { ...init, signal: controller.signal } : init);
    } catch {
      const timedOut = controller?.signal.aborted;
      throw new Error(`Can't reach the server at ${baseUrl}${timedOut ? ` (no answer after ${Math.round(timeoutMs! / 1000)} s)` : ''}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let message = `Server responded with ${response.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: unknown };
        if (typeof parsed.error === 'string' && parsed.error) message = parsed.error;
      } catch {
        // Not JSON (wrong port, another app): keep the status message.
      }
      throw new ServerError(message, response.status);
    }
    return response;
  }

  const json = async <T>(path: string, init?: RequestInit, timeoutMs?: number) =>
    (await request(path, init, timeoutMs)).json() as Promise<T>;

  return {
    getConfig: (options: { timeoutMs?: number } = {}) => json<ServerConfig>('/api/config', undefined, options.timeoutMs),

    /** Upload a file for conversion; the server keeps the result and returns a one-time link to download it to disk. */
    async convertFile(file: PickedFile, format: string): Promise<{ resultUrl: string; filename: string }> {
      const body = new FormData();
      // React Native's FormData uploads a local file from this { uri, name, type } shape.
      body.append('image', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
      body.append('format', format);
      body.append('deliver', 'link');
      const converted = await json<{ result_url: string; filename: string }>('/api/convert', { method: 'POST', body });
      return { resultUrl: `${baseUrl}${converted.result_url}`, filename: converted.filename };
    },

    async startJob(kind: JobKind, url: string, format: string, quality: string): Promise<string> {
      const body = `${kind}_url=${encodeURIComponent(url)}&format=${encodeURIComponent(format)}&quality=${encodeURIComponent(quality)}`;
      const started = await json<{ job_id: string }>(`/api/${kind}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      return started.job_id;
    },

    getProgress: (kind: JobKind, jobId: string) => json<JobProgress>(`/api/${kind}/progress/${jobId}`),

    getSpotifyPreview: (url: string) => json<SpotifyPreview>(`/api/spotify/preview?url=${encodeURIComponent(url)}`),

    resultUrl: (kind: JobKind, jobId: string) => `${baseUrl}/api/${kind}/result/${jobId}`,
  };
}

export type Client = ReturnType<typeof createClient>;
