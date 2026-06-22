import { useLanguage } from '../i18n';

/**
 * Compact DE/EN language switch. Shows both options; the active one is highlighted.
 */
export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();

  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-surface-2 p-0.5 text-xs font-semibold"
      role="group"
      aria-label={t('lang.switch')}
    >
      {(['de', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 uppercase transition ${
            lang === l ? 'bg-fg text-bg' : 'text-fg-subtle hover:text-fg-muted'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
