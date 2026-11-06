import { act, renderHook } from '@testing-library/react-native';
import { ServerError, type Client } from '../client';
import type { JobProgress } from '../types';
import { useJob } from '../useJob';

const progress = (overrides: Partial<JobProgress>): JobProgress => ({
  state: 'queued', progress: 0, speed: null, eta: null, elapsed: 0, error: null, cookiesIssue: null,
  completedItems: 0, totalItems: null, currentItem: null, message: null, filename: null, ...overrides,
});

function fakeClient(getProgress: jest.Mock) {
  return {
    startJob: jest.fn().mockResolvedValue('job-1'),
    getProgress,
    resultUrl: (kind: string, id: string) => `http://h:5000/api/${kind}/result/${id}`,
  } as unknown as Client;
}

const tick = () => act(async () => { await jest.advanceTimersByTimeAsync(2000); });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('polls until completed, then downloads the named result once', async () => {
  const getProgress = jest.fn()
    .mockResolvedValueOnce(progress({ state: 'queued' }))
    .mockResolvedValueOnce(progress({ state: 'downloading', progress: 40 }))
    .mockResolvedValueOnce(progress({ state: 'completed', progress: 100, filename: 'a.zip' }));
  const download = jest.fn().mockResolvedValue('file:///cache/a.zip');
  const { result } = await renderHook(() => useJob({ client: fakeClient(getProgress), kind: 'spotify', download }));

  await act(() => result.current.start('https://open.spotify.com/playlist/x', 'MP3', '320'));
  expect(result.current.phase).toBe('running');
  await tick();
  expect(result.current.progress?.progress).toBe(40);
  await tick();

  expect(download).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledWith('http://h:5000/api/spotify/result/job-1', 'a.zip');
  expect(result.current.phase).toBe('done');
  expect(result.current.result).toEqual({ uri: 'file:///cache/a.zip', filename: 'a.zip' });
});

test('a failed job shows the server error and stops polling', async () => {
  const getProgress = jest.fn().mockResolvedValue(progress({ state: 'failed', error: 'YouTube blocked the automated request.' }));
  const { result } = await renderHook(() => useJob({ client: fakeClient(getProgress), kind: 'youtube', download: jest.fn() }));

  await act(() => result.current.start('https://youtu.be/x', 'MP4', '720'));
  await tick();

  expect(result.current.phase).toBe('failed');
  expect(result.current.error).toBe('YouTube blocked the automated request.');
  expect(getProgress).toHaveBeenCalledTimes(1);
});

test('a job the server no longer knows says it was probably restarted', async () => {
  const getProgress = jest.fn().mockRejectedValue(new ServerError('Download job not found.', 404));
  const { result } = await renderHook(() => useJob({ client: fakeClient(getProgress), kind: 'youtube', download: jest.fn() }));

  await act(() => result.current.start('https://youtu.be/x', 'MP4', '720'));

  expect(result.current.phase).toBe('failed');
  expect(result.current.error).toBe('The server lost this job. Was it restarted?');
});

test('leaving the screen stops polling', async () => {
  const getProgress = jest.fn().mockResolvedValue(progress({ state: 'downloading' }));
  const { result, unmount } = await renderHook(() => useJob({ client: fakeClient(getProgress), kind: 'youtube', download: jest.fn() }));

  await act(() => result.current.start('https://youtu.be/x', 'MP4', '720'));
  expect(getProgress).toHaveBeenCalledTimes(1);
  await unmount();
  await act(async () => { await jest.advanceTimersByTimeAsync(10000); });

  expect(getProgress).toHaveBeenCalledTimes(1);
});

test('a completed job without a filename gets a default name', async () => {
  const getProgress = jest.fn().mockResolvedValue(progress({ state: 'completed', filename: null }));
  const download = jest.fn().mockResolvedValue('file:///cache/youtube-download');
  const { result } = await renderHook(() => useJob({ client: fakeClient(getProgress), kind: 'youtube', download }));

  await act(() => result.current.start('https://youtu.be/x', 'MP3', '192'));

  expect(download).toHaveBeenCalledWith('http://h:5000/api/youtube/result/job-1', 'youtube-download');
});
