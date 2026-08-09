# R2 CORS — required for offline photos

Offline photos (Settings → "Offline-Fotos") deliberately fetch each favorite's
image URLs and store them in the `media-cache` the service worker already reads
from. Since Phase 5 those images are served from a **separate origin**
(`media.justtally.org`), so the fetch is a cross-origin request and the bucket
has to allow it.

## The rule

Set this on the R2 bucket (Cloudflare dashboard → R2 → bucket → Settings → CORS
policy):

```json
[
  {
    "AllowedOrigins": ["https://justtally.org"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

## What happens without it

Nothing visibly breaks, which is the problem. `storeUrl()` in
`frontend/src/lib/offlineMedia.ts` tries a normal CORS fetch first; when that is
rejected it falls back to `fetch(url, { mode: 'no-cors' })` and stores the
resulting **opaque** response. That is deliberate — an opaque response still
paints in an `<img>`, so the feature degrades instead of failing — but it costs
two things:

- **No verification.** An opaque response has status 0 and an unreadable body.
  A stored 404 page from the CDN is indistinguishable from a stored photo. The
  settings page therefore reports these separately (`settings.unverified`)
  rather than counting them as confirmed.
- **Padded quota.** Browsers charge opaque responses against the storage quota
  at a padded size — considerably more than the bytes actually stored. On a
  phone that fills the origin's quota far sooner than the real photo sizes
  suggest.

So: set the rule. `no-cors` is the documented fallback, not the intended path.

## Note on expiration

Entries this feature writes with `cache.put()` are unknown to Workbox's
`ExpirationPlugin`, which only keeps books on requests that went through its own
route — so they are not subject to `maxEntries: 1200` or the 30-day age limit.
That is what makes deliberately downloaded photos stick around.

The exception worth knowing: a photo Workbox **had already cached** during
normal browsing (a thumbnail the user scrolled past, say) is already in its
bookkeeping, and writing over it does not remove it from there. Such an entry
can still be evicted. That is why the settings page re-counts what is actually
in the cache on every visit and offers "Fehlende laden" — drift is made visible
rather than assumed away.

Because nothing else will ever clean up the untracked entries, "Offline-Fotos
löschen" is the only way back and stays available regardless of the toggle.
