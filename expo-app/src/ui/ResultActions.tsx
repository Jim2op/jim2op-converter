import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { canSaveToPhotos, saveToPhotos, shareFile } from '../files/saveResult';
import { accents, usePalette } from './theme';

/** Save-to-photos (images and video only) and Share buttons for a finished file in the cache. */
export function ResultActions({ uri, filename, accent }: { uri: string; filename: string; accent: string }) {
  const palette = usePalette();
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    try {
      await shareFile(uri);
    } catch (caught) {
      setNote((caught as Error).message);
    }
  };

  const save = async () => {
    try {
      if (await saveToPhotos(uri)) setNote('Saved to your photos.');
      else await share(); // Photo access denied: the share sheet still lets the user keep the file.
    } catch (caught) {
      setNote(`Couldn't save to photos (${(caught as Error).message}). Use Share instead.`);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.name, { color: palette.text }]} numberOfLines={2}>{filename}</Text>
      <View style={styles.row}>
        {canSaveToPhotos(filename) ? (
          <Pressable onPress={save} style={[styles.button, { backgroundColor: accent }]}>
            <Text style={styles.buttonText}>Save to phone</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={share} style={[styles.button, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, borderWidth: 1 }]}>
          <Text style={[styles.buttonText, { color: palette.text }]}>Share</Text>
        </Pressable>
      </View>
      {note ? <Text style={{ color: note.startsWith('Saved') ? accents.success : palette.muted }}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  name: { fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
