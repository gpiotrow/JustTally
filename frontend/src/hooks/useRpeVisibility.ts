import { useCallback, useState } from 'react';

/**
 * Device-local, like the rest timer's wake-lock toggle: whether RPE is worth
 * showing is a matter of personal habit, not something that needs to agree
 * across a user's phone and desktop.
 */
const RPE_VISIBLE_KEY = 'jt_rpe_visible';

function readStored(): boolean {
  const raw = localStorage.getItem(RPE_VISIBLE_KEY);
  return raw === null ? true : raw === 'true';
}

export function useRpeVisibility() {
  const [visible, setVisibleState] = useState(readStored);

  const setVisible = useCallback((next: boolean) => {
    setVisibleState(next);
    localStorage.setItem(RPE_VISIBLE_KEY, String(next));
  }, []);

  return [visible, setVisible] as const;
}
