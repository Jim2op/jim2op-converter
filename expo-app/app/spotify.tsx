import { useCallback } from 'react';
import { useServer } from '../src/settings/ServerContext';
import { DownloadScreen } from '../src/ui/DownloadScreen';
import { SpotifyPreviewCard } from '../src/ui/SpotifyPreviewCard';

const FORMATS = ['MP3', 'WAV', 'OGG', 'M4A'];

export default function SpotifyScreen() {
  const { config } = useServer();
  const qualitiesFor = useCallback(() => config?.spotify_audio_qualities ?? [], [config]);
  const defaultQualityFor = useCallback(() => '192', []);

  return (
    <DownloadScreen
      kind="spotify"
      placeholder="https://open.spotify.com/track|album|playlist/…"
      formats={FORMATS}
      qualitiesFor={qualitiesFor}
      defaultQualityFor={defaultQualityFor}
      formatQuality={(_format, quality) => `${quality} kbps`}
      renderExtra={(url) => <SpotifyPreviewCard url={url} />}
    />
  );
}
