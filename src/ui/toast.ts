import { escapeHtml } from './dom.js';

/**
 * Неблокирующие уведомления вместо `alert()`, которым ai-prompt-admin пользуется везде.
 * Alert останавливает страницу, не показывает несколько сообщений подряд и не различает
 * успех и ошибку.
 */

type ToastKind = 'info' | 'success' | 'warn' | 'error';

const DEFAULT_MS = 4000;
/** Ошибку читают дольше — и она обычно требует решения. */
const ERROR_MS = 8000;

function container(): HTMLElement | null {
  return document.getElementById('toasts');
}

function show(message: string, kind: ToastKind, timeoutMs: number): void {
  const root = container();
  if (root === null) return;

  const el = document.createElement('div');
  el.className = kind === 'info' ? 'toast' : `toast ${kind}`;
  el.innerHTML = escapeHtml(message).replace(/\n/g, '<br>');
  root.appendChild(el);

  const remove = (): void => {
    el.remove();
  };
  const timer = window.setTimeout(remove, timeoutMs);

  // Клик убирает сразу: подряд идущие сообщения не должны копиться на экране.
  el.addEventListener('click', () => {
    window.clearTimeout(timer);
    remove();
  });
}

export const toast = {
  info(message: string): void {
    show(message, 'info', DEFAULT_MS);
  },
  success(message: string): void {
    show(message, 'success', DEFAULT_MS);
  },
  warn(message: string): void {
    show(message, 'warn', ERROR_MS);
  },
  error(message: string): void {
    show(message, 'error', ERROR_MS);
  },
};
