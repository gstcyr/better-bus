import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

interface Options {
  intervalMs: number;
  /** Pause polling (e.g. no route selected yet). */
  enabled?: boolean;
}

interface PollState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Seconds remaining until the next automatic refresh. */
  secondsToRefresh: number;
  refreshNow: () => void;
}

/**
 * Runs `fetcher` immediately, then every `intervalMs`, exposing a live countdown
 * (the original app showed "Map will refresh in: N seconds"). Polling pauses while
 * the app is backgrounded and resumes on foreground.
 */
export function useIntervalPoll<T>(
  fetcher: () => Promise<T>,
  { intervalMs, enabled = true }: Options,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsToRefresh, setSecondsToRefresh] = useState(
    Math.round(intervalMs / 1000),
  );

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err as Error);
    } finally {
      if (mounted.current) {
        setLoading(false);
        setSecondsToRefresh(Math.round(intervalMs / 1000));
      }
    }
  }, [intervalMs]);

  const refreshNow = useCallback(() => {
    setSecondsToRefresh(Math.round(intervalMs / 1000));
    void run();
  }, [run, intervalMs]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Countdown ticker drives the auto-refresh when it reaches zero.
  useEffect(() => {
    if (!enabled) return;
    void run();
    const id = setInterval(() => {
      setSecondsToRefresh((s) => {
        if (s <= 1) {
          void run();
          return Math.round(intervalMs / 1000);
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, intervalMs, run]);

  // Refresh on return to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && enabled) refreshNow();
    });
    return () => sub.remove();
  }, [enabled, refreshNow]);

  return { data, error, loading, secondsToRefresh, refreshNow };
}
