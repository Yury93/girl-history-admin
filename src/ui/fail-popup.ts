import { escapeHtml } from './dom.js';

/**
 * Крупное всплывающее сообщение о сбое — для ошибок, которые оператор обязан прочитать.
 *
 * Отличий от тоста два, и оба намеренные:
 *  1. НЕ исчезает само. Причину сбоя читают, а иногда копируют в переписку с провайдером;
 *     восьми секунд на это мало.
 *  2. Клик по телу НЕ закрывает (у тоста — закрывает): иначе текст ошибки нельзя было бы
 *     выделить мышью. Закрытие — только крестиком.
 *
 * Живёт в общем контейнере `#toasts`: позиционирование, колонка и сдвиг при активном
 * обучающем курсе достаются даром.
 */

export interface FailPopupOptions {
  title: string;
  reason: string;
  /** Сколько раз пробовали. Строка показывается только когда попыток было больше одной. */
  attempts?: number | null;
}

/** Страховка: при prefers-reduced-motion транзишна нет и transitionend не придёт вовсе. */
const EXIT_FALLBACK_MS = 260;

export function failPopup(options: FailPopupOptions): void {
  const root = document.getElementById('toasts');
  if (root === null) return;

  const attempts = options.attempts;
  const attemptsHtml =
    attempts === undefined || attempts === null || attempts <= 1
      ? ''
      : `<div class="fail-popup-attempts">Попыток: ${escapeHtml(String(attempts))}</div>`;

  const el = document.createElement('div');
  el.className = 'fail-popup';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="fail-popup-icon">✕</div>
    <div class="fail-popup-body">
      <div class="fail-popup-title">${escapeHtml(options.title)}</div>
      <div class="fail-popup-reason">${escapeHtml(options.reason).replace(/\n/g, '<br>')}</div>
      ${attemptsHtml}
    </div>
    <button class="fail-popup-close" type="button" aria-label="Закрыть">✕</button>`;

  const close = (): void => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      el.remove();
    };
    el.classList.add('closing');
    el.addEventListener('transitionend', finish, { once: true });
    window.setTimeout(finish, EXIT_FALLBACK_MS);
  };

  el.querySelector('.fail-popup-close')?.addEventListener('click', close);
  root.appendChild(el);
}
