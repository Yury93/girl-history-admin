import { GLOSSARY, isGlossaryKey } from '../help/help-texts.js';

/**
 * Один глобальный тултип на приложение (operator-hints_plan.md §4.4).
 *
 * `position: fixed` — единственный способ не быть обрезанным `.table-wrap`
 * с его overflow. Делегирование — через pointerover/pointerout: mouseenter
 * не всплывает и с document не ловится. Текст ставится через textContent —
 * это plain text из глоссария, разметка ему не нужна.
 */

const MARK_SELECTOR = '.help-mark';
const EDGE_PX = 8;

let tip: HTMLElement | null = null;
let anchor: HTMLElement | null = null;

function ensureTip(): HTMLElement {
  if (tip !== null) return tip;
  tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  return tip;
}

function show(mark: HTMLElement): void {
  const key = mark.dataset.help ?? '';
  if (!isGlossaryKey(key)) return;

  const el = ensureTip();
  el.textContent = GLOSSARY[key];

  // Сначала в угол — иначе прошлые координаты исказят измерение размера.
  el.style.left = '0px';
  el.style.top = '0px';
  const rect = mark.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  let x = rect.left + rect.width / 2 - width / 2;
  x = Math.max(EDGE_PX, Math.min(x, window.innerWidth - width - EDGE_PX));
  let y = rect.bottom + EDGE_PX;
  if (y + height > window.innerHeight - EDGE_PX) y = rect.top - height - EDGE_PX;

  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.classList.add('visible');
  anchor = mark;
}

export function hideTooltip(): void {
  anchor = null;
  tip?.classList.remove('visible');
}

function markOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(MARK_SELECTOR) : null;
}

/** Подписки живут на document и переживают любые перерисовки экранов. Вызывается один раз. */
export function initTooltips(): void {
  document.addEventListener('pointerover', (event) => {
    const mark = markOf(event.target);
    if (mark !== null && mark !== anchor) show(mark);
  });

  document.addEventListener('pointerout', (event) => {
    const mark = markOf(event.target);
    if (mark === null || mark !== anchor) return;
    // Переход на вложенный узел той же метки — не уход с неё.
    if (event.relatedTarget instanceof Node && mark.contains(event.relatedTarget)) return;
    hideTooltip();
  });

  document.addEventListener('focusin', (event) => {
    const mark = markOf(event.target);
    if (mark !== null) show(mark);
  });
  document.addEventListener('focusout', () => {
    hideTooltip();
  });

  // Скроллиться может и документ, и внутренние контейнеры (.table-wrap); scroll не
  // всплывает — ловим в capture-фазе и прячем: fixed-тултип не едет вместе с якорем.
  document.addEventListener(
    'scroll',
    () => {
      hideTooltip();
    },
    { capture: true, passive: true }
  );
}
