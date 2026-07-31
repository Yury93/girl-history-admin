/**
 * Общее закрытие модалок с анимацией (confirm и гид «Как это работает»).
 *
 * Ждать только transitionend нельзя: при prefers-reduced-motion транзишна нет и событие
 * не придёт вовсе — без страховочного таймера модалка зависла бы, а у confirm не
 * выполнился бы resolve и подтверждаемое действие не случилось бы никогда.
 */
const CLOSE_FALLBACK_MS = 220;

export function animateModalClose(backdrop: HTMLElement, onDone?: () => void): void {
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    backdrop.remove();
    onDone?.();
  };
  backdrop.classList.add('closing');
  backdrop.addEventListener('transitionend', finish, { once: true });
  window.setTimeout(finish, CLOSE_FALLBACK_MS);
}
