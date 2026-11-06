import { StyleSheet, Text, View } from 'react-native';
import type { JobProgress } from '../api/types';
import type { JobPhase } from '../api/useJob';
import { accents, usePalette } from './theme';

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Progress for a running YouTube/Spotify job: bar, status line, track counts, elapsed time and cookie warnings. */
export function ProgressCard({ phase, progress, error, accent }: { phase: JobPhase; progress: JobProgress | null; error: string | null; accent: string }) {
  const palette = usePalette();
  if (phase === 'idle') return null;

  const percent = phase === 'done' ? 100 : Math.round(progress?.progress ?? 0);
  const status =
    phase === 'failed' ? 'Failed'
      : phase === 'downloading' ? 'Saving to your phone…'
        : phase === 'done' ? 'Ready'
          : progress?.message || (progress?.state === 'queued' || !progress ? 'Starting…' : 'Downloading…');

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.header}>
        <Text style={[styles.status, { color: phase === 'failed' ? accents.danger : palette.text }]}>{status}</Text>
        {phase !== 'failed' ? <Text style={{ color: palette.muted }}>{percent}%</Text> : null}
      </View>
      {phase !== 'failed' ? (
        <View style={[styles.track, { backgroundColor: palette.surfaceSoft }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent }]} />
        </View>
      ) : null}
      {error ? <Text style={{ color: accents.danger }}>{error}</Text> : null}
      {progress?.totalItems ? (
        <Text style={{ color: palette.muted }}>{progress.completedItems} of {progress.totalItems} tracks</Text>
      ) : null}
      {progress?.currentItem && phase === 'running' ? (
        <Text style={{ color: palette.muted }} numberOfLines={1}>Now: {progress.currentItem}</Text>
      ) : null}
      {progress ? <Text style={{ color: palette.muted }}>Elapsed {formatElapsed(progress.elapsed)}</Text> : null}
      {progress?.cookiesIssue ? <Text style={{ color: accents.danger }}>{progress.cookiesIssue}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  status: { fontWeight: '700', flexShrink: 1 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
