import type { PickedFile } from '../api/types';

const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/tiff': 'tiff',
  'image/avif': 'avif', 'image/bmp': 'bmp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi',
};
const MIME_FOR_EXTENSION = Object.fromEntries(Object.entries(EXTENSION_FOR_MIME).map(([mime, ext]) => [ext, mime]));
MIME_FOR_EXTENSION.jpeg = 'image/jpeg';

type PickerAsset = { uri: string; fileName?: string | null; mimeType?: string | null };

/** Build the upload description the server needs; the server picks its converter from the file extension. */
export function pickedFileFromAsset(asset: PickerAsset, kind: 'image' | 'video'): PickedFile {
  const fromUri = /\/([^/?#]+\.([A-Za-z0-9]+))(?:[?#].*)?$/.exec(asset.uri);
  const uriExtension = fromUri?.[2].toLowerCase();
  const mimeType = asset.mimeType || (uriExtension && MIME_FOR_EXTENSION[uriExtension]) || (kind === 'image' ? 'image/jpeg' : 'video/mp4');
  const name = asset.fileName || fromUri?.[1] || `${kind}.${EXTENSION_FOR_MIME[mimeType] ?? (kind === 'image' ? 'jpg' : 'mp4')}`;
  return { uri: asset.uri, name, mimeType };
}
