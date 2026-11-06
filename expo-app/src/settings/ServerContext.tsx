import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type Client } from '../api/client';
import type { ServerConfig } from '../api/types';
import { loadServerAddress, normalizeServerAddress, saveServerAddress } from './serverAddress';

type Status = 'unset' | 'checking' | 'online' | 'offline';

type ServerState = {
  address: string | null;
  client: Client | null;
  config: ServerConfig | null;
  status: Status;
  error: string | null;
  /** Validate, save and test a new address. Returns false when the input is not a valid address. */
  setAddress(input: string): Promise<boolean>;
  refresh(): Promise<void>;
};

const ServerContext = createContext<ServerState | null>(null);

export function ServerProvider({ children }: { children: ReactNode }) {
  const [address, setAddressState] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [status, setStatus] = useState<Status>('unset');
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(() => (address ? createClient(address) : null), [address]);

  const check = useCallback(async (target: string) => {
    setStatus('checking');
    setError(null);
    try {
      setConfig(await createClient(target).getConfig());
      setStatus('online');
    } catch (caught) {
      setConfig(null);
      setError((caught as Error).message);
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    loadServerAddress().then((saved) => {
      if (!saved) return;
      setAddressState(saved);
      void check(saved);
    });
  }, [check]);

  const value: ServerState = {
    address,
    client,
    config,
    status,
    error,
    async setAddress(input) {
      const normalized = normalizeServerAddress(input);
      if (!normalized) return false;
      await saveServerAddress(normalized);
      setAddressState(normalized);
      await check(normalized);
      return true;
    },
    async refresh() {
      if (address) await check(address);
    },
  };

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServer(): ServerState {
  const state = useContext(ServerContext);
  if (!state) throw new Error('useServer must be used inside ServerProvider');
  return state;
}
