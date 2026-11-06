import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import Layout from '../app/_layout';
import Home from '../app/index';

const config = {
  image_formats: ['PNG', 'JPEG'], video_outputs: ['GIF', 'MP3'], youtube_video_qualities: ['720'],
  youtube_audio_qualities: ['192'], spotify_audio_qualities: ['192'], youtube_cookies_configured: true,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => config, text: async () => JSON.stringify(config),
  }) as unknown as typeof fetch;
});

test('testing a typed address connects and remembers it', async () => {
  await renderRouter({ _layout: Layout, index: Home });

  await fireEvent.changeText(screen.getByPlaceholderText('http://192.168.1.20:5000'), '127.0.0.1:5000');
  await fireEvent.press(screen.getByText('Test connection'));

  expect(await screen.findByText('Connected. YouTube cookies are configured.')).toBeTruthy();
  expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:5000/api/config', undefined);
  expect(await AsyncStorage.getItem('converter.serverAddress')).toBe('http://127.0.0.1:5000');
});

test('an unreachable server shows why', async () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
  await renderRouter({ _layout: Layout, index: Home });

  await fireEvent.changeText(screen.getByPlaceholderText('http://192.168.1.20:5000'), '10.0.0.9:5000');
  await fireEvent.press(screen.getByText('Test connection'));

  expect(await screen.findByText("Not connected: Can't reach the server at http://10.0.0.9:5000")).toBeTruthy();
});

test('an invalid address is rejected before any request', async () => {
  await renderRouter({ _layout: Layout, index: Home });

  await fireEvent.changeText(screen.getByPlaceholderText('http://192.168.1.20:5000'), 'not a url');
  await fireEvent.press(screen.getByText('Test connection'));

  expect(await screen.findByText('That doesn’t look like an address. Try 192.168.1.20:5000')).toBeTruthy();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
