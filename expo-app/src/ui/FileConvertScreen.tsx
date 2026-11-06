import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PickedFile } from '../api/types';
import { pickedFileFromAsset } from '../files/pickedFile';
import { writeBytesToCache } from '../files/saveResult';
import { useServer } from '../settings/ServerContext';
import { OptionPicker } from './OptionPicker';
import { PrimaryButton } from './PrimaryButton';
import { ResultActions } from './ResultActions';
import { ServerBanner } from './ServerBanner';
import { accents, usePalette } from './theme';

/** Shared Image and Video screen: pick from the library, choose an output, convert on the server. */
export function FileConvertScreen({ kind }: { kind: 'image' | 'video' }) {
  const { client, config, status } = useServer();
  const palette = usePalette();
  const accent = accents[kind];
  const formats = (kind === 'image' ? config?.image_formats : config?.video_outputs) ?? [];
  const [file, setFile] = useState<PickedFile | null>(null);
  const [format, setFormat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ uri: string; filename: string } | null>(null);

  useEffect(() => {
    if (!formats.includes(format)) setFormat(formats[kind === 'image' ? 1 : 0] ?? formats[0] ?? '');
  }, [formats, format, kind]);

  const pick = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind === 'image' ? 'images' : 'videos'],
      // Ask iOS for JPEG/H.264 rather than HEIC/HEVC, which the server can't read.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setFile(pickedFileFromAsset(picked.assets[0], kind));
    setResult(null);
    setError(null);
  };

  const convert = async () => {
    if (!client || !file || !format) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const converted = await client.convertFile(file, format);
      setResult({ uri: await writeBytesToCache(converted.bytes, converted.filename), filename: converted.filename });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ServerBanner />
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Pressable onPress={pick} style={[styles.picker, { borderColor: accent, backgroundColor: palette.surfaceSoft }]}>
          {file && kind === 'image' ? <Image source={{ uri: file.uri }} style={styles.preview} resizeMode="contain" /> : null}
          <Text style={{ color: palette.text, fontWeight: '600' }}>
            {file ? file.name : kind === 'image' ? 'Choose an image' : 'Choose a video'}
          </Text>
          <Text style={{ color: palette.muted }}>{file ? 'Tap to choose another' : 'From your photo library'}</Text>
        </Pressable>
        {formats.length ? (
          <OptionPicker label="Convert to" options={formats} value={format} onChange={setFormat} accent={accent} disabled={busy} />
        ) : null}
        <PrimaryButton
          label="Convert"
          onPress={convert}
          accent={accent}
          busy={busy}
          disabled={!file || !format || status !== 'online'}
        />
        {error ? <Text style={{ color: accents.danger }}>{error}</Text> : null}
      </View>
      {result ? <ResultActions uri={result.uri} filename={result.filename} accent={accent} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  picker: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 18, alignItems: 'center', gap: 6 },
  preview: { width: '100%', height: 180, borderRadius: 8 },
});
