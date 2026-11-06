import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

const CHECK_TIMEOUT_MS = 5000;

const ServerContext = createContext<ServerState | null>(null);

export function ServerProvider({ children }: { children: ReactNode }) {
  const [address, setAddressState] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [status, setStatus] = useState<Status>('unset');
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(() => (address ? createClient(address) : null), [address]);
  // Only the newest check may set the status; a slow failure for an old address must not win.
  const latestCheck = useRef(0);

  const check = useCallback(async (target: string) => {
    const id = ++latestCheck.current;
    setStatus('checking');
    setError(null);
    try {
      const next = await createClient(target).getConfig({ timeoutMs: CHECK_TIMEOUT_MS });
      if (id !== latestCheck.current) return;
      setConfig(next);
      setStatus('online');
    } catch (caught) {
      if (id !== latestCheck.current) return;
      setConfig(null);
      setError((caught as Error).message);
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    loadServerAddress().then((saved) => {
      // Skip the saved address if the user already entered one.
      if (!saved || latestCheck.current > 0) return;
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
