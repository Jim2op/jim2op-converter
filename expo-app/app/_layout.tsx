import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ServerProvider } from '../src/settings/ServerContext';
import { usePalette } from '../src/ui/theme';

export default function RootLayout() {
  const palette = usePalette();
  return (
    <ServerProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.text,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Converter' }} />
        <Stack.Screen name="image" options={{ title: 'Image converter' }} />
        <Stack.Screen name="video" options={{ title: 'Video converter' }} />
        <Stack.Screen name="youtube" options={{ title: 'YouTube downloader' }} />
        <Stack.Screen name="spotify" options={{ title: 'Spotify downloader' }} />
      </Stack>
    </ServerProvider>
  );
}
