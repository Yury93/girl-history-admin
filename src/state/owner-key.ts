/**
 * Ключ владельца. Регистрации в продукте нет: ключ живёт в браузере и определяет,
 * чей список профилей показать.
 *
 * Механика бэкенда (girl-history/src/controllers/http-helpers.ts:13-20): если клиент не
 * прислал заголовок `x-owner-key` — ИЛИ прислал короче 16 символов — сервер молча генерирует
 * новый и кладёт его в заголовок ОТВЕТА. Не прочитать и не сохранить его = быть новым
 * владельцем при каждом запросе и видеть вечно пустой список.
 *
 * Чистка localStorage = потеря доступа ко всем своим профилям. Другого места ключ не имеет,
 * поэтому в интерфейсе его надо показывать и давать скопировать.
 */

const STORAGE_KEY = 'gh-admin:owner-key';

/** Сервер игнорирует ключи короче этого (http-helpers.ts:15). */
const MIN_LENGTH = 16;

export const OWNER_KEY_HEADER = 'x-owner-key';

export function getOwnerKey(): string | null {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === null) return null;
  const trimmed = value.trim();
  // Слишком короткий ключ сервер всё равно отбросит и выдаст новый — не отправляем такой.
  return trimmed.length >= MIN_LENGTH ? trimmed : null;
}

/** Сохраняет ключ, выданный сервером. Короткие игнорируем — они бесполезны. */
export function rememberOwnerKey(value: string): void {
  const trimmed = value.trim();
  if (trimmed.length < MIN_LENGTH) return;
  if (trimmed === getOwnerKey()) return;
  localStorage.setItem(STORAGE_KEY, trimmed);
}

/** Ручная замена: пользователь переносит доступ на другую машину. */
export function setOwnerKey(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < MIN_LENGTH) return false;
  localStorage.setItem(STORAGE_KEY, trimmed);
  return true;
}
