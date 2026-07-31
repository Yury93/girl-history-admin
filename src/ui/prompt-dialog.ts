import { escapeHtml } from './dom.js';
import { animateModalClose } from './modal.js';

/**
 * Модалка с текстовым полем — для ввода имени (создание профиля). Родня `confirm.ts`:
 * тот же backdrop, Escape, анимация закрытия. Возвращает введённую строку или null.
 */

export interface PromptOptions {
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  const root = document.getElementById('modal-root');
  if (root === null) return Promise.resolve(null);

  return new Promise<string | null>((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${escapeHtml(options.title)}</h3>
        <p>${escapeHtml(options.message)}</p>
        <div class="field">
          <input type="text" id="promptValue" autocomplete="off"
            placeholder="${escapeHtml(options.placeholder ?? '')}" />
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="promptCancel">Отмена</button>
          <button class="btn-primary" id="promptOk" disabled>
            ${escapeHtml(options.confirmLabel ?? 'Создать')}
          </button>
        </div>
      </div>`;

    const okBtn = backdrop.querySelector<HTMLButtonElement>('#promptOk');
    const cancelBtn = backdrop.querySelector<HTMLButtonElement>('#promptCancel');
    const input = backdrop.querySelector<HTMLInputElement>('#promptValue');

    const close = (result: string | null): void => {
      document.removeEventListener('keydown', onKey);
      animateModalClose(backdrop, () => {
        resolve(result);
      });
    };
    const submit = (): void => {
      const value = input?.value.trim() ?? '';
      if (value !== '') close(value);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(null);
      if (event.key === 'Enter') submit();
    };

    input?.addEventListener('input', () => {
      if (okBtn !== null) okBtn.disabled = (input?.value.trim() ?? '') === '';
    });
    okBtn?.addEventListener('click', submit);
    cancelBtn?.addEventListener('click', () => {
      close(null);
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(null);
    });
    document.addEventListener('keydown', onKey);

    root.appendChild(backdrop);
    input?.focus();
  });
}
