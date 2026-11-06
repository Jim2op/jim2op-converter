import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from './theme';

type Props = {
  label: string;
  options: string[];
  value: string;
  onChange(value: string): void;
  accent: string;
  /** Optional display text per option, e.g. "720p" for "720". */
  format?(option: string): string;
  disabled?: boolean;
};

/** A row of chips for choosing one output format or quality. */
export function OptionPicker({ label, options, value, onChange, accent, format = (o) => o, disabled }: Props) {
  const palette = usePalette();
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option)}
              style={[
                styles.chip,
                { borderColor: selected ? accent : palette.border, backgroundColor: selected ? accent : palette.surfaceSoft },
              ]}
            >
              <Text style={{ color: selected ? '#fff' : palette.text, fontWeight: '600' }}>{format(option)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
});
