/**
 * Ключ доступа к движку.
 *
 * Механика бэкенда (`middleware/admin-key.ts`): если на сервере задан `ADMIN_KEY`, каждый
 * запрос к `/engine/*` обязан нести заголовок `x-admin-key` с тем же значением, иначе 401.
 * Пустой `ADMIN_KEY` на сервере пропускает всё — так работает дев-машина.
 *
 * Отличие от прежнего `owner-key`: сервер этот ключ НЕ выдаёт и не присылает в ответе.
 * Его задаёт человек, он общий на команду, и хранится он здесь же, в браузере.
 */

const STORAGE_KEY = 'nova-admin:admin-key';

export const ADMIN_KEY_HEADER = 'x-admin-key';

export function getAdminKey(): string | null {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function setAdminKey(value: string): void {
  const trimmed = value.trim();
  if (trimmed === '') {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, trimmed);
}

export function hasAdminKey(): boolean {
  return getAdminKey() !== null;
}
