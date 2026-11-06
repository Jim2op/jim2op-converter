import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { ServerProvider, useServer } from '../ServerContext';

const config = {
  image_formats: ['PNG'], video_outputs: ['GIF'], youtube_video_qualities: ['720'],
  youtube_audio_qualities: ['192'], spotify_audio_qualities: ['192'], youtube_cookies_configured: true,
};

beforeEach(() => AsyncStorage.clear());

test('a slow failure for an old address does not overwrite a newer success', async () => {
  let failOldAddress: (error: Error) => void = () => {};
  globalThis.fetch = jest.fn((url: string) => (url.startsWith('http://10.0.0.1:5000')
    ? new Promise((_resolve, reject) => { failOldAddress = reject; })
    : Promise.resolve({ ok: true, status: 200, json: async () => config, text: async () => '' }))) as unknown as typeof fetch;
  const { result } = await renderHook(() => useServer(), { wrapper: ServerProvider });

  let oldCheck: Promise<boolean> = Promise.resolve(true);
  await act(async () => { oldCheck = result.current.setAddress('10.0.0.1:5000'); });
  await act(() => result.current.setAddress('10.0.0.2:5000'));
  expect(result.current.status).toBe('online');

  await act(async () => {
    failOldAddress(new TypeError('Network request failed'));
    await oldCheck;
  });

  expect(result.current.status).toBe('online');
  expect(result.current.address).toBe('http://10.0.0.2:5000');
});
