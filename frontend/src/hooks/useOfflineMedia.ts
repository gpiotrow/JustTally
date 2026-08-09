import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearStoredMedia,
  countCached,
  downloadUrls,
  isOfflineMediaSupported,
  mediaUrlsFor,
  storageUsage,
  type DownloadSummary,
} from '../lib/offlineMedia';
import type { Exercise } from '../lib/types';
import { useOnline } from './useOnline';

/**
 * Device-local, not an account setting. The question this answers is "should
 * *this* device spend storage on photos" — tight on a phone, irrelevant on a
 * desktop. A server-side flag would wrongly impose one device's answer on all
 * of them. Same reasoning, and same storage, as `jt_theme` / `jt_lang`.
 */
const ENABLED_KEY = 'jt_offline_media';

function readEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === '1';
}

/**
 * Keep the favorites' photos available without a network.
 *
 * @param favoriteExercises the exercises whose photos should be kept offline.
 */
export function useOfflineMedia(favoriteExercises: Exercise[]) {
  const online = useOnline();
  const supported = isOfflineMediaSupported();
  const [enabled, setEnabledState] = useState(readEnabled);
  const [cachedCount, setCachedCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<DownloadSummary | null>(null);
  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = mediaUrlsFor(favoriteExercises);
  // Compared by value: `urls` is a fresh array each render, so using it directly
  // as an effect dependency would restart the download pass on every render.
  const urlsKey = urls.join('|');

  const stoppedRef = useRef(false);
  const runningRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!supported) return;
    const [count, usage] = await Promise.all([countCached(urls), storageUsage()]);
    setCachedCount(count);
    setUsageBytes(usage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, urlsKey]);

  const download = useCallback(async () => {
    if (!supported || runningRef.current) return;
    runningRef.current = true;
    stoppedRef.current = false;
    setError(null);
    setProgress({ done: 0, total: urls.length });
    try {
      const result = await downloadUrls(urls, setProgress, () => stoppedRef.current);
      setSummary(result);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      runningRef.current = false;
      setProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, urlsKey, refreshStatus]);

  const clear = useCallback(async () => {
    setError(null);
    try {
      await clearStoredMedia();
      setSummary(null);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear');
    }
  }, [refreshStatus]);

  const setEnabled = useCallback(
    (next: boolean) => {
      localStorage.setItem(ENABLED_KEY, next ? '1' : '0');
      setEnabledState(next);
      if (!next) {
        // Switching off has to actually free the storage, otherwise the toggle
        // claims something it did not do.
        stoppedRef.current = true;
        void clear();
      }
    },
    [clear]
  );

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Fill in whatever is missing whenever the favorites change while the
  // setting is on — the user said "keep my favorites offline", so a newly
  // added favorite is covered without them having to come back here.
  useEffect(() => {
    if (!enabled || !online || !supported || urls.length === 0) return;
    if (cachedCount >= urls.length) return;
    void download();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, online, supported, urlsKey, cachedCount]);

  return {
    supported,
    enabled,
    setEnabled,
    /** Photos of the current favorites that are in the cache. */
    cachedCount,
    totalCount: urls.length,
    progress,
    summary,
    usageBytes,
    error,
    download,
    clear,
    canDownload: online,
  };
}
