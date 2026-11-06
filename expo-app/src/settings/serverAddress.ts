import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'converter.serverAddress';
// Scheme, then a hostname/IPv4 or bracketed IPv6, then an optional port. No path: the app adds /api/... itself.
const ADDRESS_PATTERN = /^(https?):\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:\d{1,5})?$/;

/** Turn what the user typed into `http(s)://host[:port]`, or null when it can't be a server address. */
export function normalizeServerAddress(input: string): string | null {
  let address = input.trim().replace(/\/+$/, '');
  if (!address) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) address = `http://${address}`;
  const match = ADDRESS_PATTERN.exec(address);
  if (!match) return null;
  return `${match[1].toLowerCase()}://${match[2]}${match[3] ?? ''}`;
}

export async function loadServerAddress(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function saveServerAddress(address: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, address);
}
