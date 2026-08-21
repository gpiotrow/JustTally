import { Modal } from './ui';
import { useT } from '../i18n';

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Defaults to the shared "delete" label — the common case. Pass an explicit one for a non-delete destructive action (e.g. "disable"). */
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Red confirm button, the default: every current caller is a delete or a disable. Set `false` for a confirm that isn't itself dangerous. */
  destructive?: boolean;
}

/**
 * The one place a destructive action still needs to interrupt instead of the
 * app's usual undo toast (`Workout.tsx`'s swap/remove, `Routines.tsx`'s day/
 * exercise removal) — because there is nowhere left to undo *to* once the
 * action reaches the server (a queued sync tombstone, a disabled account).
 *
 * A thin wrapper around the shared `Modal` rather than `window.confirm`: it
 * gets the same theming, i18n button labels, and focus-trap every other
 * dialog in the app already has, instead of an unstyled native dialog that
 * behaves differently across browsers and installed PWAs.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = true,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 ${destructive ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmLabel ?? t('common.delete')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-fg">{message}</p>
    </Modal>
  );
}
