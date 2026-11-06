import { useCallback, useEffect, useRef, useState } from 'react';
import { ServerError, type Client } from './client';
import type { JobKind, JobProgress } from './types';

export type JobPhase = 'idle' | 'running' | 'downloading' | 'done' | 'failed';

type Deps = {
  client: Client;
  kind: JobKind;
  /** Fetch the finished result into local storage and return its file URI. */
  download: (url: string, filename: string) => Promise<string>;
  intervalMs?: number;
};

const LOST_JOB = 'The server lost this job. Was it restarted?';
const MAX_NETWORK_RETRIES = 4;

/** Start a YouTube or Spotify job, poll its progress, and download the result once it completes. */
export function useJob({ client, kind, download, intervalMs = 2000 }: Deps) {
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ uri: string; filename: string } | null>(null);
  // Each run gets a token; a reset, a new start or unmounting invalidates it so stale polls do nothing.
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    run.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const fail = (message: string) => {
    setError(message);
    setPhase('failed');
  };

  const poll = async (token: number, jobId: string, networkMisses = 0): Promise<void> => {
    let current: JobProgress;
    try {
      current = await client.getProgress(kind, jobId);
    } catch (caught) {
      if (token !== run.current) return;
      if (caught instanceof ServerError) {
        // The server answered, so retrying won't help.
        fail(caught.status === 404 ? LOST_JOB : caught.message);
      } else if (networkMisses < MAX_NETWORK_RETRIES) {
        // Wi-Fi blips and app resumes are common on phones; the job keeps running on the PC meanwhile.
        timer.current = setTimeout(() => void poll(token, jobId, networkMisses + 1), intervalMs);
      } else {
        fail(`Lost contact with the server (${(caught as Error).message}). Check the Wi-Fi, then start the download again.`);
      }
      return;
    }
    if (token !== run.current) return;
    setProgress(current);

    if (current.state === 'completed') {
      const filename = current.filename || `${kind}-download`;
      setPhase('downloading');
      try {
        const uri = await download(client.resultUrl(kind, jobId), filename);
        if (token !== run.current) return;
        setResult({ uri, filename });
        setPhase('done');
      } catch (caught) {
        // The server deletes a result once it has been sent, so this can't be retried.
        if (token === run.current) {
          fail(`The download finished on the PC but couldn't be saved to this phone (${(caught as Error).message}). Start it again.`);
        }
      }
    } else if (current.state === 'failed' || current.state === 'error') {
      fail(current.error || 'The download failed.');
    } else {
      timer.current = setTimeout(() => void poll(token, jobId), intervalMs);
    }
  };

  const start = async (url: string, format: string, quality: string) => {
    stop();
    const token = run.current;
    setProgress(null);
    setResult(null);
    setError(null);
    setPhase('running');
    let jobId: string;
    try {
      jobId = await client.startJob(kind, url, format, quality);
    } catch (caught) {
      if (token === run.current) fail((caught as Error).message);
      return;
    }
    if (token === run.current) await poll(token, jobId);
  };

  const reset = () => {
    stop();
    setPhase('idle');
    setProgress(null);
    setError(null);
    setResult(null);
  };

  return { phase, progress, error, result, start, reset };
}
