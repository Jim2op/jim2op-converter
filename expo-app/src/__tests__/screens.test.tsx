jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(_dir: unknown, name: string) { this.uri = `file:///cache/${name}`; }
    create() {}
    delete() {}
    async write() {}
    static downloadFileAsync = jest.fn(async (_url: string, destination: { uri: string }) => destination);
  }
  return { File, Paths: { cache: 'cache' } };
});
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { renderRouter } from 'expo-router/testing-library';
import Layout from '../../app/_layout';
import Home from '../../app/index';
import ImageScreen from '../../app/image';
import SpotifyScreen from '../../app/spotify';
import YouTubeScreen from '../../app/youtube';

const BASE = 'http://10.0.0.5:5000';
const config = {
  image_formats: ['PNG', 'JPEG', 'WEBP'], video_outputs: ['GIF', 'MP3'], youtube_video_qualities: ['1080', '720'],
  youtube_audio_qualities: ['192', '128'], spotify_audio_qualities: ['320', '192'], youtube_cookies_configured: false,
};
const routes = { _layout: Layout, index: Home, image: ImageScreen, youtube: YouTubeScreen, spotify: SpotifyScreen };

function json(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } };
}

let fetchMock: jest.Mock;
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('converter.serverAddress', BASE);
  fetchMock = jest.fn(async (url: string) => {
    if (url === `${BASE}/api/config`) return json(config);
    throw new Error(`unexpected ${url}`);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

test('the image screen converts a picked photo and offers to save it', async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false, assets: [{ uri: 'file:///photos/cat.png', fileName: 'cat.png', mimeType: 'image/png' }],
  });
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/api/config')) return json(config);
    if (url.endsWith('/api/convert')) return json({ result_url: '/api/convert/result/c1', filename: 'cat.jpg' }, 201);
    throw new Error(`unexpected ${url}`);
  });
  await renderRouter(routes, { initialUrl: '/image' });

  await fireEvent.press(await screen.findByText('Choose an image'));
  await fireEvent.press(await screen.findByText('JPEG'));
  await fireEvent.press(screen.getByText('Convert'));

  expect(await screen.findByText('cat.jpg')).toBeTruthy();
  expect(screen.getByText('Save to phone')).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/convert`, expect.objectContaining({ method: 'POST' }));
  expect(File.downloadFileAsync).toHaveBeenCalledWith(`${BASE}/api/convert/result/c1`, expect.anything(), { idempotent: true });
});

test('the YouTube screen downloads a finished job and offers to share it', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/api/config')) return json(config);
    if (url.endsWith('/api/youtube/download')) return json({ job_id: 'j1', state: 'queued' }, 202);
    if (url.endsWith('/api/youtube/progress/j1')) {
      return json({ state: 'completed', progress: 100, elapsed: 3, completedItems: 0, totalItems: null, filename: 'clip.mp3' });
    }
    throw new Error(`unexpected ${url}`);
  });
  await renderRouter(routes, { initialUrl: '/youtube' });

  await fireEvent.changeText(await screen.findByPlaceholderText(/youtube\.com/), 'https://www.youtube.com/watch?v=abc');
  await fireEvent.press(screen.getByText('MP3'));
  await fireEvent.press(await screen.findByText('128 kbps'));
  await fireEvent.press(screen.getByText('Download'));

  expect(await screen.findByText('clip.mp3')).toBeTruthy();
  expect(screen.getByText('Share')).toBeTruthy();
  expect(screen.queryByText('Save to phone')).toBeNull();
  const start = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/youtube/download'));
  expect(start?.[1].body).toBe(`youtube_url=${encodeURIComponent('https://www.youtube.com/watch?v=abc')}&format=MP3&quality=128`);
  expect(File.downloadFileAsync).toHaveBeenCalledWith(`${BASE}/api/youtube/result/j1`, expect.anything(), { idempotent: true });
});

test('the Spotify screen previews a playlist and shows a failed job’s message', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/api/config')) return json(config);
    if (url.includes('/api/spotify/preview')) return json({ title: 'myMusic', author: null, thumbnail_url: null });
    if (url.endsWith('/api/spotify/download')) return json({ job_id: 's1', state: 'queued', kind: 'playlist' }, 202);
    if (url.endsWith('/api/spotify/progress/s1')) {
      return json({ state: 'failed', progress: 10, elapsed: 4, completedItems: 2, totalItems: 30, error: 'YouTube blocked the automated request.' });
    }
    throw new Error(`unexpected ${url}`);
  });
  await renderRouter(routes, { initialUrl: '/spotify' });

  await fireEvent.changeText(await screen.findByPlaceholderText(/open\.spotify\.com/), 'https://open.spotify.com/playlist/1aSZlaGZeBv034gok6EIrG?si=x');
  expect(await screen.findByText('myMusic', {}, { timeout: 3000 })).toBeTruthy();
  await fireEvent.press(screen.getByText('Download'));

  expect(await screen.findByText('YouTube blocked the automated request.')).toBeTruthy();
  expect(screen.getByText('2 of 30 tracks')).toBeTruthy();
  expect(screen.getByText('Start another download')).toBeTruthy();
});
