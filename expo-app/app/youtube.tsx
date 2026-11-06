import { useCallback } from 'react';
import { useServer } from '../src/settings/ServerContext';
import { DownloadScreen } from '../src/ui/DownloadScreen';

const FORMATS = ['MP4', 'MP3', 'WAV', 'OGG', 'M4A'];

export default function YouTubeScreen() {
  const { config } = useServer();
  const qualitiesFor = useCallback(
    (format: string) => (format === 'MP4' ? config?.youtube_video_qualities : config?.youtube_audio_qualities) ?? [],
    [config],
  );
  const defaultQualityFor = useCallback((format: string) => (format === 'MP4' ? '720' : '192'), []);

  return (
    <DownloadScreen
      kind="youtube"
      placeholder="https://www.youtube.com/watch?v=… or a playlist link"
      formats={FORMATS}
      qualitiesFor={qualitiesFor}
      defaultQualityFor={defaultQualityFor}
      formatQuality={(format, quality) => (format === 'MP4' ? `${quality}p` : `${quality} kbps`)}
    />
  );
}
