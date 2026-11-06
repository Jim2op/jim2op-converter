import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useServer } from '../settings/ServerContext';
import { accents, usePalette } from './theme';

/** Shown on tool screens whenever the server can't be used; hidden while online. */
export function ServerBanner() {
  const { address, status, error } = useServer();
  const palette = usePalette();
  if (status === 'online' || status === 'checking') return null;

  return (
    <View style={[styles.banner, { backgroundColor: palette.surfaceSoft, borderColor: accents.danger }]}>
      <Text style={[styles.title, { color: palette.text }]}>
        {status === 'unset' ? 'No server set' : "Can't reach the server"}
      </Text>
      {address ? <Text style={{ color: palette.muted }}>{address}</Text> : null}
      {error ? <Text style={{ color: palette.muted }}>{error}</Text> : null}
      <Text style={{ color: palette.muted }}>
        Same Wi-Fi as the PC? Node allowed through Windows Firewall?
      </Text>
      <Link href="/" style={[styles.link, { color: accents.image }]}>
        Set the server address
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4, marginBottom: 16 },
  title: { fontWeight: '700', fontSize: 15 },
  link: { fontWeight: '600', marginTop: 4 },
});
