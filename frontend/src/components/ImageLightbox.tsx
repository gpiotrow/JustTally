import { useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { useT } from '../i18n';

export interface LightboxImage {
  url: string;
  alt: string;
}

/**
 * Fullscreen image viewer. Opened by tapping a photo in the exercise detail
 * gallery; shows the full-size image (not the thumbnail the gallery scrolls
 * through) with prev/next when there is more than one.
 */
export function ImageLightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const t = useT();
  const hasMultiple = images.length > 1;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasMultiple) onNavigate((index - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight' && hasMultiple) onNavigate((index + 1) % images.length);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, images.length, hasMultiple, onClose, onNavigate]);

  // Body scroll is locked while the lightbox is open, same as any other
  // fullscreen overlay — otherwise the page behind it scrolls with a swipe.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const current = images[index];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2.5 text-white/90 hover:text-white"
        aria-label={t('common.close')}
      >
        ✕
      </button>

      {hasMultiple && (
        <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/90">
          {index + 1} / {images.length}
        </span>
      )}

      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index - 1 + images.length) % images.length);
          }}
          className="absolute left-2 z-10 rounded-full bg-black/50 p-2 text-white/90 hover:text-white sm:left-4"
          aria-label={t('lightbox.previous')}
        >
          <ChevronLeftIcon width={24} height={24} />
        </button>
      )}

      <img
        src={current.url}
        alt={current.alt}
        className="max-h-[90vh] max-w-[92vw] select-none object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index + 1) % images.length);
          }}
          className="absolute right-2 z-10 rounded-full bg-black/50 p-2 text-white/90 hover:text-white sm:right-4"
          aria-label={t('lightbox.next')}
        >
          <ChevronRightIcon width={24} height={24} />
        </button>
      )}
    </div>
  );
}
