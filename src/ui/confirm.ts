import { escapeHtml } from './dom.js';

/**
 * Модалка подтверждения вместо `confirm()`.
 *
 * Нужна не ради вида: удаление профиля каскадом сносит ВСЕ его хроники, дни и файлы
 * (persona-service.ts:118). Такое подтверждать однокнопочным `confirm()` нельзя —
 * для необратимых действий предусмотрен режим с вводом имени.
 */

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Текст кнопки подтверждения. */
  confirmLabel?: string;
  /** Опасное действие: кнопка красная. */
  danger?: boolean;
  /**
   * Если задано — кнопка разблокируется, только когда пользователь введёт ровно эту строку.
   * Для необратимого удаления.
   */
  requirePhrase?: string;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const root = document.getElementById('modal-root');
  if (root === null) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const phrase = options.requirePhrase;
    const phraseBlock =
      phrase === undefined
        ? ''
        : `<div class="field">
             <label>Для подтверждения введите <code>${escapeHtml(phrase)}</code></label>
             <input type="text" id="confirmPhrase" autocomplete="off" />
           </div>`;

    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${escapeHtml(options.title)}</h3>
        <p>${escapeHtml(options.message).replace(/\n/g, '<br>')}</p>
        ${phraseBlock}
        <div class="modal-actions">
          <button class="btn-secondary" id="confirmCancel">Отмена</button>
          <button class="${options.danger === true ? 'btn-danger' : 'btn-primary'}" id="confirmOk">
            ${escapeHtml(options.confirmLabel ?? 'Подтвердить')}
          </button>
        </div>
      </div>`;

    const okBtn = backdrop.querySelector<HTMLButtonElement>('#confirmOk');
    const cancelBtn = backdrop.querySelector<HTMLButtonElement>('#confirmCancel');
    const phraseInput = backdrop.querySelector<HTMLInputElement>('#confirmPhrase');

    const close = (result: boolean): void => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };

    // Escape отменяет, Enter подтверждает — но только когда фраза уже введена.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(false);
      if (event.key === 'Enter' && okBtn !== null && !okBtn.disabled) close(true);
    };

    if (phrase !== undefined && okBtn !== null && phraseInput !== null) {
      okBtn.disabled = true;
      phraseInput.addEventListener('input', () => {
        okBtn.disabled = phraseInput.value.trim() !== phrase;
      });
    }

    okBtn?.addEventListener('click', () => {
      close(true);
    });
    cancelBtn?.addEventListener('click', () => {
      close(false);
    });
    // Клик мимо окна = отмена. По самому окну — нет, иначе не выделить текст.
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey);

    root.appendChild(backdrop);
    (phraseInput ?? okBtn)?.focus();
  });
}
