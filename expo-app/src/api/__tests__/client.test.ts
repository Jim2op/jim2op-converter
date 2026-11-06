import { createClient, filenameFromDisposition, ServerError } from '../client';

type FakeInit = { status?: number; json?: unknown; text?: string; headers?: Record<string, string>; bytes?: number[] };

function fakeResponse({ status = 200, json, text, headers = {}, bytes = [] }: FakeInit) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const body = text ?? (json === undefined ? '' : JSON.stringify(json));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => JSON.parse(body),
    text: async () => body,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as Response;
}

function formFieldNames(body: unknown): string[] {
  const form = body as { getParts?: () => { fieldName: string }[]; keys?: () => Iterable<string> };
  if (form.getParts) return form.getParts().map((part) => part.fieldName);
  return [...(form.keys?.() ?? [])];
}

const BASE = 'http://h:5000';

test('getConfig reads /api/config', async () => {
  const config = { image_formats: ['PNG'], video_outputs: ['GIF'] };
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ json: config }));
  await expect(createClient(BASE, fetchImpl).getConfig()).resolves.toEqual(config);
  expect(fetchImpl.mock.calls[0][0]).toBe('http://h:5000/api/config');
});

test('getConfig gives up after the timeout instead of waiting on a wrong address', async () => {
  jest.useFakeTimers();
  try {
    const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const failure = createClient(BASE, fetchImpl as unknown as typeof fetch).getConfig({ timeoutMs: 5000 });
    const assertion = expect(failure).rejects.toThrow("Can't reach the server at http://h:5000 (no answer after 5 s)");
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  } finally {
    jest.useRealTimers();
  }
});

test('a JSON error from the server keeps its message and status', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ status: 400, json: { error: 'Unsupported file type.' } }));
  const failure = createClient(BASE, fetchImpl).getConfig();
  await expect(failure).rejects.toBeInstanceOf(ServerError);
  await expect(failure).rejects.toMatchObject({ message: 'Unsupported file type.', status: 400 });
});

test('a non-JSON error page becomes a readable status message', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ status: 404, text: '<html>Not here</html>' }));
  await expect(createClient(BASE, fetchImpl).getConfig()).rejects.toMatchObject({ message: 'Server responded with 404', status: 404 });
});

test('a network failure says the server cannot be reached', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  await expect(createClient(BASE, fetchImpl).getConfig()).rejects.toThrow("Can't reach the server at http://h:5000");
});

test('startJob sends a form-encoded Spotify request and returns the job id', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ status: 202, json: { job_id: 'job-1', state: 'queued' } }));
  const url = 'https://open.spotify.com/playlist/abc';
  await expect(createClient(BASE, fetchImpl).startJob('spotify', url, 'MP3', '320')).resolves.toBe('job-1');
  const [calledUrl, init] = fetchImpl.mock.calls[0];
  expect(calledUrl).toBe('http://h:5000/api/spotify/download');
  expect(init.method).toBe('POST');
  expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  expect(init.body).toBe(`spotify_url=${encodeURIComponent(url)}&format=MP3&quality=320`);
});

test('startJob uses youtube_url for YouTube', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ status: 202, json: { job_id: 'y' } }));
  await createClient(BASE, fetchImpl).startJob('youtube', 'https://youtu.be/x', 'MP4', '720');
  expect(fetchImpl.mock.calls[0][1].body).toMatch(/^youtube_url=/);
});

test('convertFile uploads image and format and returns the bytes and filename', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(
    fakeResponse({ headers: { 'Content-Disposition': 'attachment; filename="photo.jpg"' }, bytes: [1, 2, 3] }),
  );
  const result = await createClient(BASE, fetchImpl).convertFile({ uri: 'file:///p.png', name: 'p.png', mimeType: 'image/png' }, 'JPEG');
  expect(fetchImpl.mock.calls[0][0]).toBe('http://h:5000/api/convert');
  expect(formFieldNames(fetchImpl.mock.calls[0][1].body).sort()).toEqual(['format', 'image']);
  expect(Array.from(result.bytes)).toEqual([1, 2, 3]);
  expect(result.filename).toBe('photo.jpg');
});

test('getProgress and resultUrl use the job kind', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ json: { state: 'queued' } }));
  const client = createClient(BASE, fetchImpl);
  await client.getProgress('youtube', 'abc');
  expect(fetchImpl.mock.calls[0][0]).toBe('http://h:5000/api/youtube/progress/abc');
  expect(client.resultUrl('spotify', 'abc')).toBe('http://h:5000/api/spotify/result/abc');
});

test('getSpotifyPreview encodes the URL', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ json: { title: 'myMusic', author: null, thumbnail_url: null } }));
  await createClient(BASE, fetchImpl).getSpotifyPreview('https://open.spotify.com/playlist/a?si=b');
  expect(fetchImpl.mock.calls[0][0]).toBe(
    `http://h:5000/api/spotify/preview?url=${encodeURIComponent('https://open.spotify.com/playlist/a?si=b')}`,
  );
});

describe('filenameFromDisposition', () => {
  test('decodes an RFC 5987 filename', () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''my%20song.mp3", 'x')).toBe('my song.mp3');
  });
  test('reads a quoted filename with spaces', () => {
    expect(filenameFromDisposition('attachment; filename="My Song.mp3"', 'x')).toBe('My Song.mp3');
  });
  test('falls back when the header is missing', () => {
    expect(filenameFromDisposition(null, 'x.zip')).toBe('x.zip');
  });
});
