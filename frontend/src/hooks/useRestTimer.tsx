import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { del, get, set } from 'idb-keyval';
import {
  DEFAULT_REST_SECONDS,
  isStale,
  remainingSeconds,
  adjustDuration,
  type RestState,
} from '../lib/restTimer';

/**
 * Device state, not account data: a running rest belongs to the phone in the
 * gym, and it holds nothing but two numbers.
 */
const REST_KEY = 'jt_rest_timer';
const WAKE_LOCK_KEY = 'jt_rest_wake_lock';
const DEFAULT_SECONDS_KEY = 'jt_rest_default_seconds';

/** A rest older than this is junk left behind by a session someone abandoned. */
const RESTORE_LIMIT_MS = 60 * 60 * 1000;

/** Re-render cadence. Twice a second keeps the last tick from visibly sticking. */
const TICK_MS = 500;

interface RestTimerValue {
  rest: RestState | null;
  /** Seconds left; 0 once the rest has run out. */
  remaining: number;
  finished: boolean;
  defaultSeconds: number;
  setDefaultSeconds: (seconds: number) => void;
  wakeLockEnabled: boolean;
  setWakeLockEnabled: (enabled: boolean) => void;
  /**
   * Begin a rest. Call from the same handler as the tap that triggered it —
   * the audio alarm can only be armed inside a user gesture.
   */
  start: (seconds?: number) => void;
  adjust: (deltaSeconds: number) => void;
  stop: () => void;
}

const RestTimerContext = createContext<RestTimerValue | null>(null);

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function readStoredSeconds(): number {
  const raw = Number(localStorage.getItem(DEFAULT_SECONDS_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_REST_SECONDS;
}

/**
 * A short two-tone beep synthesised on the spot. No audio file to ship, cache
 * or fail to load offline — which matters for a sound whose entire job is to
 * work in a basement gym with no signal.
 *
 * The context must be created during a user gesture, so `arm()` is called from
 * the check-off handler rather than lazily at playback time.
 */
function createBeeper() {
  let ctx: AudioContext | null = null;

  const arm = () => {
    if (ctx) {
      // Browsers suspend the context when the tab is backgrounded; resuming is
      // only permitted from a gesture, which is exactly where we are.
      if (ctx.state === 'suspended') void ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  };

  const play = () => {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    [0, 0.18].forEach((offset, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = i === 0 ? 880 : 1174.7;
      osc.type = 'sine';
      // Ramped rather than switched: an abrupt start and stop on a sine wave
      // clicks, which reads as a glitch instead of a signal.
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.35, now + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.15);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    });
  };

  return { arm, play };
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [rest, setRest] = useState<RestState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [defaultSeconds, setDefaultSecondsState] = useState(readStoredSeconds);
  const [wakeLockEnabled, setWakeLockEnabledState] = useState(() =>
    readStoredBoolean(WAKE_LOCK_KEY, true)
  );

  const beeper = useRef(createBeeper());
  const alarmedFor = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Restore a rest that was running when the app was closed or reloaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await get<RestState>(REST_KEY);
      if (cancelled || !stored) return;
      if (Date.now() - stored.startedAt > RESTORE_LIMIT_MS) {
        await del(REST_KEY);
        return;
      }
      // Restored rests never alarm: whatever they were counting towards
      // already passed while the app was gone.
      alarmedFor.current = stored.startedAt;
      setRest(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const remaining = rest ? remainingSeconds(rest, now) : 0;
  const finished = rest !== null && remaining === 0;

  // Tick only while a rest is actually counting.
  useEffect(() => {
    if (!rest || finished) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [rest, finished]);

  // A hidden tab's timers are throttled to the point of uselessness, so the
  // clock is re-read the moment the app is looked at again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Fire the alarm once per rest, and never for one that expired long ago.
  useEffect(() => {
    if (!rest || !finished) return;
    if (alarmedFor.current === rest.startedAt) return;
    alarmedFor.current = rest.startedAt;
    if (isStale(rest, Date.now())) return;

    beeper.current.play();
    // Unsupported in Safari/iOS — there is no fallback to reach for, so the
    // sound and the visual change carry it there.
    navigator.vibrate?.([200, 100, 200]);
  }, [rest, finished]);

  /**
   * Keep the screen on while resting, so the alarm has something to alarm on.
   * Re-acquired on return to visibility because the browser drops the lock
   * whenever the page is hidden.
   */
  useEffect(() => {
    const shouldHold = wakeLockEnabled && rest !== null && !finished;

    const release = () => {
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };

    if (!shouldHold || !('wakeLock' in navigator)) {
      release();
      return;
    }

    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || wakeLock.current) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        wakeLock.current = sentinel;
      } catch {
        // Denied by the browser (low battery, unsupported surface). Nothing to
        // recover — the timer still runs, the screen just may sleep.
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      release();
    };
  }, [wakeLockEnabled, rest, finished]);

  const start = useCallback(
    (seconds?: number) => {
      beeper.current.arm();
      const next: RestState = {
        startedAt: Date.now(),
        durationSeconds: seconds ?? defaultSeconds,
      };
      alarmedFor.current = null;
      setRest(next);
      setNow(Date.now());
      void set(REST_KEY, next);
    },
    [defaultSeconds]
  );

  const adjust = useCallback((deltaSeconds: number) => {
    setRest((prev) => {
      if (!prev) return prev;
      const next = adjustDuration(prev, deltaSeconds);
      void set(REST_KEY, next);
      return next;
    });
    setNow(Date.now());
  }, []);

  const stop = useCallback(() => {
    setRest(null);
    alarmedFor.current = null;
    void del(REST_KEY);
  }, []);

  const setDefaultSeconds = useCallback((seconds: number) => {
    setDefaultSecondsState(seconds);
    localStorage.setItem(DEFAULT_SECONDS_KEY, String(seconds));
  }, []);

  const setWakeLockEnabled = useCallback((enabled: boolean) => {
    setWakeLockEnabledState(enabled);
    localStorage.setItem(WAKE_LOCK_KEY, String(enabled));
  }, []);

  return (
    <RestTimerContext.Provider
      value={{
        rest,
        remaining,
        finished,
        defaultSeconds,
        setDefaultSeconds,
        wakeLockEnabled,
        setWakeLockEnabled,
        start,
        adjust,
        stop,
      }}
    >
      {children}
    </RestTimerContext.Provider>
  );
}

export function useRestTimer() {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error('useRestTimer must be used within RestTimerProvider');
  return ctx;
}
