import { pickedFileFromAsset } from '../pickedFile';

test('keeps the picker file name and MIME type', () => {
  expect(pickedFileFromAsset({ uri: 'file:///a.png', fileName: 'holiday.png', mimeType: 'image/png' }, 'image')).toEqual({
    uri: 'file:///a.png', name: 'holiday.png', mimeType: 'image/png',
  });
});

test('names a file from its MIME type when the picker gives no name', () => {
  expect(pickedFileFromAsset({ uri: 'file:///x', fileName: null, mimeType: 'video/mp4' }, 'video').name).toBe('video.mp4');
});

test('uses the extension in the URI when name and MIME type are missing', () => {
  expect(pickedFileFromAsset({ uri: 'file:///cache/IMG_1.MOV' }, 'video')).toEqual({
    uri: 'file:///cache/IMG_1.MOV', name: 'IMG_1.MOV', mimeType: 'video/quicktime',
  });
});

test('gives a jpeg name when nothing describes the image', () => {
  expect(pickedFileFromAsset({ uri: 'content://media/123' }, 'image')).toEqual({
    uri: 'content://media/123', name: 'image.jpg', mimeType: 'image/jpeg',
  });
});
