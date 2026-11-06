import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

export function PrimaryButton({ label, onPress, accent, disabled, busy }: {
  label: string; onPress(): void; accent: string; disabled?: boolean; busy?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      onPress={onPress}
      disabled={inactive}
      style={[styles.button, { backgroundColor: accent, opacity: inactive ? 0.5 : 1 }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  text: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
