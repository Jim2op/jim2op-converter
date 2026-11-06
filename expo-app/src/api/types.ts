/** Shapes returned by the Converter server (server.js). */
export type ServerConfig = {
  image_formats: string[];
  video_outputs: string[];
  youtube_video_qualities: string[];
  youtube_audio_qualities: string[];
  spotify_audio_qualities: string[];
  youtube_cookies_configured: boolean;
};

export type JobKind = 'youtube' | 'spotify';

export type JobProgress = {
  state: string; // queued | downloading | finalizing | completed | failed
  progress: number;
  speed: string | null;
  eta: string | null;
  elapsed: number;
  error: string | null;
  cookiesIssue: string | null;
  completedItems: number;
  totalItems: number | null;
  currentItem: string | null;
  message: string | null;
  filename: string | null;
};

export type SpotifyPreview = {
  title: string | null;
  author: string | null;
  thumbnail_url: string | null;
};

export type PickedFile = { uri: string; name: string; mimeType: string };
