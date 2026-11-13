import { el } from '../../ui/dom.js';

let dialogCount = 0;

/**
 * An accessible confirmation dialog for destructive actions.
 *
 * - announced as a modal dialog, with its title and message read out
 * - focus starts on the safe choice (Cancel), is kept inside the dialog while it is
 *   open, and returns to where it was afterwards
 * - Escape, the Cancel button, or a click outside all cancel
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger] style the confirm button as destructive
 * @param {HTMLElement} [options.root] where to attach the dialog
 * @returns {Promise<boolean>} true if confirmed
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  root = document.body,
}) {
  return new Promise((resolve) => {
    dialogCount += 1;
    const titleId = `confirm-title-${dialogCount}`;
    const messageId = `confirm-message-${dialogCount}`;
    const previouslyFocused = document.activeElement;

    const cancel = el('button', {
      type: 'button',
      class: 'bw-btn bw-btn-secondary',
      text: cancelLabel,
      onClick: () => close(false),
    });
    const confirm = el('button', {
      type: 'button',
      class: `bw-btn ${danger ? 'bw-btn-danger' : 'bw-btn-primary'}`,
      text: confirmLabel,
      onClick: () => close(true),
    });

    const overlay = el(
      'div',
      {
        class: 'db-modal-overlay',
        onMouseDown: (event) => {
          if (event.target === overlay) close(false);
        },
      },
      [
        el(
          'div',
          {
            class: 'db-modal bw-card',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': titleId,
            'aria-describedby': messageId,
          },
          [
            el('h2', { id: titleId, class: 'db-modal-title', text: title }),
            el('p', { id: messageId, class: 'db-modal-text', text: message }),
            el('div', { class: 'db-modal-actions' }, [cancel, confirm]),
          ],
        ),
      ],
    );

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      } else if (event.key === 'Tab') {
        // Keep focus inside the dialog.
        if (event.shiftKey && document.activeElement === cancel) {
          event.preventDefault();
          confirm.focus();
        } else if (!event.shiftKey && document.activeElement === confirm) {
          event.preventDefault();
          cancel.focus();
        }
      }
    }

    function close(result) {
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    }

    document.addEventListener('keydown', onKeydown, true);
    root.append(overlay);
    cancel.focus();
  });
}
