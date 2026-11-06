import { Link, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useServer } from '../settings/ServerContext';
import { accents, usePalette } from '../ui/theme';

const TOOLS: { href: Href; title: string; description: string; accent: string }[] = [
  { href: '/image', title: 'Image converter', description: 'Convert between PNG, JPEG, WebP, GIF, TIFF and AVIF.', accent: accents.image },
  { href: '/video', title: 'Video converter', description: 'Turn a video into a GIF or extract its audio.', accent: accents.video },
  { href: '/youtube', title: 'YouTube downloader', description: 'Save a video or playlist as MP4 or audio.', accent: accents.youtube },
  { href: '/spotify', title: 'Spotify downloader', description: 'Get a track, album or playlist as audio files.', accent: accents.spotify },
];

export default function Home() {
  const { address, status, error, config, setAddress } = useServer();
  const palette = usePalette();
  const [draft, setDraft] = useState(address ?? '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (address) setDraft(address);
  }, [address]);

  const testConnection = async () => {
    setInvalid(!(await setAddress(draft)));
  };

  const statusText = {
    unset: 'Enter your PC’s address to connect.',
    checking: 'Connecting…',
    online: `Connected. YouTube cookies ${config?.youtube_cookies_configured ? 'are' : 'are not'} configured.`,
    offline: `Not connected: ${error ?? 'unknown error'}`,
  }[status];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.label, { color: palette.text }]}>Converter server</Text>
        <TextInput
          value={draft}
          onChangeText={(text) => { setDraft(text); setInvalid(false); }}
          placeholder="http://192.168.1.20:5000"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={testConnection}
          style={[styles.input, { color: palette.text, backgroundColor: palette.input, borderColor: palette.border }]}
        />
        {invalid ? <Text style={{ color: accents.danger }}>That doesn’t look like an address. Try 192.168.1.20:5000</Text> : null}
        <Pressable
          onPress={testConnection}
          disabled={status === 'checking'}
          style={[styles.button, { backgroundColor: accents.image, opacity: status === 'checking' ? 0.6 : 1 }]}
        >
          {status === 'checking' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Test connection</Text>}
        </Pressable>
        <Text style={{ color: status === 'online' ? accents.success : status === 'offline' ? accents.danger : palette.muted }}>
          {statusText}
        </Text>
      </View>

      {TOOLS.map((tool) => (
        <Link key={tool.title} href={tool.href} asChild>
          <Pressable
            style={StyleSheet.flatten([styles.card, styles.tool, { backgroundColor: palette.surface, borderColor: palette.border, borderLeftColor: tool.accent }])}
          >
            <Text style={[styles.toolTitle, { color: palette.text }]}>{tool.title}</Text>
            <Text style={{ color: palette.muted }}>{tool.description}</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  label: { fontWeight: '700', fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  tool: { borderLeftWidth: 5, gap: 4 },
  toolTitle: { fontWeight: '700', fontSize: 17 },
});
