import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadServerAddress, normalizeServerAddress, saveServerAddress } from '../serverAddress';

describe('normalizeServerAddress', () => {
  test('adds http:// and strips spaces and trailing slashes', () => {
    expect(normalizeServerAddress(' 192.168.1.20:5000/ ')).toBe('http://192.168.1.20:5000');
  });

  test('keeps an https tunnel address as typed', () => {
    expect(normalizeServerAddress('https://abc.trycloudflare.com')).toBe('https://abc.trycloudflare.com');
  });

  test.each(['', '   ', 'not a url', 'ftp://x:1'])('rejects %p', (input) => {
    expect(normalizeServerAddress(input)).toBeNull();
  });
});

describe('saved server address', () => {
  beforeEach(() => AsyncStorage.clear());

  test('is null before anything is saved', async () => {
    expect(await loadServerAddress()).toBeNull();
  });

  test('round-trips through storage', async () => {
    await saveServerAddress('http://192.168.1.20:5000');
    expect(await loadServerAddress()).toBe('http://192.168.1.20:5000');
  });
});
