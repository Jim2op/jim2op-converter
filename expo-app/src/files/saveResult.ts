import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// The photo library only accepts images and videos; audio and ZIPs go through the share sheet instead.
const PHOTO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov']);

export function canSaveToPhotos(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  return dot > 0 && PHOTO_EXTENSIONS.has(filename.slice(dot + 1).toLowerCase());
}

/** Keep server-provided names safe to use as a single file name in the cache folder. */
function cacheFile(filename: string): File {
  const safe = filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download';
  const file = new File(Paths.cache, safe);
  if (file.exists) file.delete();
  return file;
}

/** Download a finished job result into the cache and return its local URI. */
export async function downloadToCache(url: string, filename: string): Promise<string> {
  const downloaded = await File.downloadFileAsync(url, cacheFile(filename), { idempotent: true });
  return downloaded.uri;
}

/** Write converted bytes from /api/convert into the cache and return the local URI. */
export async function writeBytesToCache(bytes: Uint8Array, filename: string): Promise<string> {
  const file = cacheFile(filename);
  file.create();
  await file.write(bytes);
  return file.uri;
}

/** Save an image or video to the photo library. Returns false when the user denies access. */
export async function saveToPhotos(uri: string): Promise<boolean> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return false;
  await MediaLibrary.Asset.create(uri);
  return true;
}

export async function shareFile(uri: string): Promise<void> {
  await Sharing.shareAsync(uri);
}
