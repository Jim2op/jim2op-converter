import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createClient } from '../api/client';
import type { JobKind } from '../api/types';
import { useJob } from '../api/useJob';
import { downloadToCache } from '../files/saveResult';
import { useServer } from '../settings/ServerContext';
import { OptionPicker } from './OptionPicker';
import { PrimaryButton } from './PrimaryButton';
import { ProgressCard } from './ProgressCard';
import { ResultActions } from './ResultActions';
import { ServerBanner } from './ServerBanner';
import { accents, usePalette } from './theme';

type Props = {
  kind: JobKind;
  placeholder: string;
  formats: string[];
  /** Qualities for the chosen format, from /api/config. */
  qualitiesFor(format: string): string[];
  defaultQualityFor(format: string): string;
  formatQuality(format: string, quality: string): string;
  /** Extra content under the URL field (the Spotify preview), given the current URL. */
  renderExtra?(url: string): ReactNode;
};

// A client that is never called: lets useJob mount before the server address is known.
const OFFLINE_CLIENT = createClient('http://offline.invalid');

/** Shared YouTube and Spotify screen: paste a link, choose output, run the job, then save or share the result. */
export function DownloadScreen({ kind, placeholder, formats, qualitiesFor, defaultQualityFor, formatQuality, renderExtra }: Props) {
  const { client, status } = useServer();
  const palette = usePalette();
  const accent = accents[kind];
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState(formats[0]);
  const [quality, setQuality] = useState(defaultQualityFor(formats[0]));
  const job = useJob({ client: client ?? OFFLINE_CLIENT, kind, download: downloadToCache });
  const qualities = useMemo(() => qualitiesFor(format), [qualitiesFor, format]);
  const busy = job.phase === 'running' || job.phase === 'downloading';

  useEffect(() => {
    if (!qualities.includes(quality)) setQuality(qualities.includes(defaultQualityFor(format)) ? defaultQualityFor(format) : qualities[0] ?? '');
  }, [qualities, quality, format, defaultQualityFor]);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ServerBanner />
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
          style={[styles.input, { color: palette.text, backgroundColor: palette.input, borderColor: palette.border }]}
        />
        {renderExtra?.(url)}
        <OptionPicker label="Format" options={formats} value={format} onChange={setFormat} accent={accent} disabled={busy} />
        <OptionPicker
          label="Quality"
          options={qualities}
          value={quality}
          onChange={setQuality}
          accent={accent}
          disabled={busy}
          format={(q) => formatQuality(format, q)}
        />
        <PrimaryButton
          label="Download"
          onPress={() => void job.start(url.trim(), format, quality)}
          accent={accent}
          busy={busy}
          disabled={!url.trim() || !quality || status !== 'online'}
        />
      </View>
      <ProgressCard phase={job.phase} progress={job.progress} error={job.error} accent={accent} />
      {job.result ? <ResultActions uri={job.result.uri} filename={job.result.filename} accent={accent} /> : null}
      {job.phase === 'done' || job.phase === 'failed' ? (
        <Text style={[styles.again, { color: accent }]} onPress={job.reset}>Start another download</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  again: { textAlign: 'center', fontWeight: '700', paddingVertical: 8 },
});
