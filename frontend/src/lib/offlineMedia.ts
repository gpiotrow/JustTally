import type { Exercise } from './types';

/**
 * The same cache Workbox's CacheFirst media route uses (see vite.config.ts).
 * It has to be this one: an `<img>` request is served by Workbox looking in
 * `media-cache`, so anything we store anywhere else would never be found and
 * the photo would still hit the network — which is the whole thing we are
 * trying to avoid.
 */
export const MEDIA_CACHE_NAME = 'media-cache';

/** Device-local list of URLs this feature deliberately stored. */
const URLS_KEY = 'jt_offline_media_urls';

/**
 * What we actually know about a stored URL.
 *
 * `opaque` is the uncomfortable one: a no-cors response has status 0 and an
 * unreadable body, so "it worked" and "the CDN returned a 404 page" are
 * indistinguishable. It is still worth storing — the browser can paint it in an
 * `<img>` — but it must never be reported to the user as confirmed.
 */
export type StoreOutcome = 'verified' | 'opaque' | 'failed';

export function isOfflineMediaSupported(): boolean {
  return typeof caches !== 'undefined' && typeof fetch !== 'undefined';
}

/**
 * Full-size and thumbnail URLs of an exercise's photos.
 *
 * Images only. Videos are excluded deliberately: a single clip can outweigh
 * every photo in the catalog combined, and quietly filling a phone's storage
 * from a toggle labelled "photos" is not a trade the user agreed to.
 */
export function mediaUrlsFor(exercises: Exercise[]): string[] {
  const urls = new Set<string>();
  for (const exercise of exercises) {
    for (const media of exercise.media) {
      if (media.mediaType !== 'image') continue;
      if (media.url) urls.add(media.url);
      if (media.thumbnailUrl) urls.add(media.thumbnailUrl);
    }
  }
  return [...urls];
}

/** URLs this feature has stored, as recorded on this device. */
export function trackedUrls(): string[] {
  try {
    const raw = localStorage.getItem(URLS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

function setTrackedUrls(urls: string[]) {
  localStorage.setItem(URLS_KEY, JSON.stringify(urls));
}

/**
 * Store one URL, preferring a response we can actually verify.
 *
 * Since media moved to R2 it is cross-origin (media.justtally.org vs
 * justtally.org), so a normal fetch is a CORS request and fails outright
 * unless the bucket sends the matching headers — see docs/media-and-catalog-plan
 * for the required rule. When it does fail we fall back to `no-cors`, which
 * yields an opaque response: good enough to render, impossible to check, and
 * charged against the storage quota at a padded size. Hence the distinct
 * outcome rather than folding it in with success.
 */
export async function storeUrl(cache: Cache, url: string): Promise<StoreOutcome> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) {
      await cache.put(url, res);
      return 'verified';
    }
    // A real HTTP error. Caching it would serve a 404 body as if it were a
    // photo, so leave the cache untouched and report the failure.
    return 'failed';
  } catch {
    // Network down, or the CORS preflight/response check rejected it.
  }

  try {
    const res = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
    await cache.put(url, res);
    return 'opaque';
  } catch {
    return 'failed';
  }
}

/** Whether a URL is currently in the media cache, and whether it is verifiable. */
export async function inspectUrl(cache: Cache, url: string): Promise<'verified' | 'opaque' | null> {
  const hit = await cache.match(url);
  if (!hit) return null;
  return hit.type === 'opaque' || hit.status === 0 ? 'opaque' : 'verified';
}

export interface DownloadProgress {
  done: number;
  total: number;
}

export interface DownloadSummary {
  verified: number;
  opaque: number;
  failed: number;
}

/**
 * Ensure every given URL is in the media cache.
 *
 * Sequential on purpose: this runs on phones on gym wifi, and firing a few
 * hundred parallel requests is a good way to have the connection drop most of
 * them. Already-cached URLs cost one cache lookup and no network.
 */
export async function downloadUrls(
  urls: string[],
  onProgress?: (progress: DownloadProgress) => void,
  shouldStop?: () => boolean
): Promise<DownloadSummary> {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const summary: DownloadSummary = { verified: 0, opaque: 0, failed: 0 };
  const tracked = new Set(trackedUrls());

  let done = 0;
  for (const url of urls) {
    if (shouldStop?.()) break;

    const existing = await inspectUrl(cache, url);
    const outcome = existing ?? (await storeUrl(cache, url));

    if (outcome === 'failed') summary.failed += 1;
    else {
      if (outcome === 'opaque') summary.opaque += 1;
      else summary.verified += 1;
      tracked.add(url);
    }

    done += 1;
    onProgress?.({ done, total: urls.length });
  }

  setTrackedUrls([...tracked]);
  return summary;
}

/** How many of these URLs are already in the cache. */
export async function countCached(urls: string[]): Promise<number> {
  if (urls.length === 0) return 0;
  const cache = await caches.open(MEDIA_CACHE_NAME);
  let count = 0;
  for (const url of urls) {
    if (await inspectUrl(cache, url)) count += 1;
  }
  return count;
}

/**
 * Drop everything this feature stored.
 *
 * Deletes exactly the tracked URLs rather than the whole cache, so Workbox's
 * own runtime-cached entries for pages the user is still browsing survive.
 * Without this there is no way back: entries we wrote ourselves are invisible
 * to Workbox's ExpirationPlugin, so nothing else will ever clean them up.
 */
export async function clearStoredMedia(): Promise<number> {
  if (!isOfflineMediaSupported()) return 0;
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const urls = trackedUrls();
  let removed = 0;
  for (const url of urls) {
    if (await cache.delete(url)) removed += 1;
  }
  setTrackedUrls([]);
  return removed;
}

/** Bytes this origin currently occupies, when the browser will say. */
export async function storageUsage(): Promise<number | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage } = await navigator.storage.estimate();
    return usage ?? null;
  } catch {
    return null;
  }
}
