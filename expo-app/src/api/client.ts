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
  async function request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch {
      throw new Error(`Can't reach the server at ${baseUrl}`);
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

  const json = async <T>(path: string, init?: RequestInit) => (await request(path, init)).json() as Promise<T>;

  return {
    getConfig: () => json<ServerConfig>('/api/config'),

    async convertFile(file: PickedFile, format: string): Promise<{ bytes: Uint8Array; filename: string }> {
      const body = new FormData();
      // React Native's FormData uploads a local file from this { uri, name, type } shape.
      body.append('image', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
      body.append('format', format);
      const response = await request('/api/convert', { method: 'POST', body });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, filename: filenameFromDisposition(response.headers.get('Content-Disposition'), file.name) };
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
