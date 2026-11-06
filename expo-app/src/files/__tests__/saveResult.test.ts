jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  Asset: { create: jest.fn() },
}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: 'cache' } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));

import * as MediaLibrary from 'expo-media-library';
import { canSaveToPhotos, saveToPhotos } from '../saveResult';

describe('canSaveToPhotos', () => {
  test.each(['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.mp4', 'a.mov', 'PHOTO.JPG'])('%s goes to photos', (name) => {
    expect(canSaveToPhotos(name)).toBe(true);
  });

  test.each(['a.mp3', 'a.wav', 'a.ogg', 'a.m4a', 'a.zip', 'a.tiff', 'a.avif', 'a.bmp', 'noextension'])('%s is shared instead', (name) => {
    expect(canSaveToPhotos(name)).toBe(false);
  });
});

describe('saveToPhotos', () => {
  test('returns false without saving when permission is denied', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, status: 'denied' });
    await expect(saveToPhotos('file:///cache/a.jpg')).resolves.toBe(false);
    expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
  });

  test('asks for write-only access and saves when granted', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, status: 'granted' });
    await expect(saveToPhotos('file:///cache/a.jpg')).resolves.toBe(true);
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith('file:///cache/a.jpg');
  });
});
