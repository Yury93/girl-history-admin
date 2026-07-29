/**
 * Работа с DOM. Один хелпер на проект — в ai-prompt-admin `escapeHtml` продублирован
 * в каждом компоненте, причём в двух разных реализациях (clothing-component.ts:163 через
 * replace и prompt-component.ts:333 через textContent).
 */

/**
 * Экранирование ЛЮБОГО текста, который попадает в innerHTML.
 *
 * Тексты дней приходят от LLM, имена и промпты — от пользователя. Пропущенное
 * экранирование здесь — это XSS в инструменте, который смотрит на чужие фотографии.
 * Через textContent, а не цепочкой replace: браузер закрывает и кавычки, и всё прочее.
 */
export function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

/** Обязательный контейнер. Отсутствие — ошибка разметки, а не рядовая ситуация. */
export function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Контейнер #${id} не найден`);
  return el;
}

/**
 * Поиск ВНУТРИ своего контейнера, а не через глобальный document.getElementById.
 * В админке компоненты ищут элементы глобально (clothing-component.ts:47-50), и два
 * компонента с одинаковым id тихо перехватывают чужие кнопки.
 */
export function query<T extends HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

export function queryAll<T extends HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Делегирование клика: подписка на контейнер вместо подписки на каждую кнопку.
 * Пережидает перерисовку списка — обработчики не надо навешивать заново.
 */
export function onClick(
  root: HTMLElement,
  selector: string,
  handler: (element: HTMLElement, event: MouseEvent) => void
): void {
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const match = target.closest<HTMLElement>(selector);
    if (match !== null && root.contains(match)) handler(match, event);
  });
}

/** Блокирует кнопку на время запроса — иначе двойной клик создаёт две сущности. */
export async function withBusy<T>(
  button: HTMLButtonElement | null,
  run: () => Promise<T>
): Promise<T> {
  if (button === null) return run();
  const previous = button.textContent;
  button.disabled = true;
  button.dataset.busy = '1';
  try {
    return await run();
  } finally {
    button.disabled = false;
    delete button.dataset.busy;
    if (previous !== null) button.textContent = previous;
  }
}
