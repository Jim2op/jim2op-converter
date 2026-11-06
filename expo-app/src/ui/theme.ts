import { useColorScheme } from 'react-native';

// Same tokens as static/style.css so the phone app matches the browser app.
const light = {
  bg: '#f7f9fc', surface: '#ffffff', surfaceSoft: '#f2f6fb', text: '#18212f', muted: '#64748b',
  border: '#e3eaf3', input: '#ffffff',
};
const dark = {
  bg: '#111827', surface: '#182231', surfaceSoft: '#202d3f', text: '#edf3fa', muted: '#a8b5c5',
  border: '#2d3b4d', input: '#16202e',
};

export const accents = {
  image: '#4B9CD3',
  video: '#198754',
  youtube: '#d9534f',
  spotify: '#1db954',
  danger: '#d9534f',
  success: '#198754',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
