import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { SpotifyPreview } from '../api/types';
import { useServer } from '../settings/ServerContext';
import { usePalette } from './theme';

const SPOTIFY_LINK = /^https:\/\/open\.spotify\.com\/(intl-[a-z-]+\/)?(track|album|playlist)\/[A-Za-z0-9]+/;

/** Cover and title for a pasted Spotify link, fetched 500 ms after the link stops changing. */
export function SpotifyPreviewCard({ url }: { url: string }) {
  const { client } = useServer();
  const palette = usePalette();
  const [preview, setPreview] = useState<SpotifyPreview | null>(null);

  useEffect(() => {
    setPreview(null);
    const link = url.trim();
    if (!client || !SPOTIFY_LINK.test(link)) return;
    let active = true;
    const timer = setTimeout(() => {
      client.getSpotifyPreview(link).then((details) => { if (active) setPreview(details); }).catch(() => {});
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [client, url]);

  if (!preview?.title) return null;
  return (
    <View style={[styles.row, { backgroundColor: palette.surfaceSoft }]}>
      {preview.thumbnail_url ? <Image source={{ uri: preview.thumbnail_url }} style={styles.cover} /> : null}
      <View style={styles.text}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={2}>{preview.title}</Text>
        {preview.author ? <Text style={{ color: palette.muted }} numberOfLines={1}>{preview.author}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 12, alignItems: 'center' },
  cover: { width: 56, height: 56, borderRadius: 6 },
  text: { flex: 1, gap: 2 },
  title: { fontWeight: '700' },
});
