import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { de, type TKey } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';

const STORAGE_KEY = 'jt_lang';
const DICTS: Record<Lang, Record<TKey, string>> = { de, en };

type TParams = Record<string, string | number>;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key for the active language, filling in `{name}` placeholders. */
  t: (key: TKey, params?: TParams) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' ? 'en' : 'de'; // default German
  });

  // Keep the document language attribute in sync for a11y / browser features.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(next: Lang) {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  function t(key: TKey, params?: TParams) {
    const dict = DICTS[lang];
    return interpolate(dict[key] ?? de[key] ?? key, params);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

/** Convenience hook when only the translate function is needed. */
export function useT() {
  return useLanguage().t;
}
