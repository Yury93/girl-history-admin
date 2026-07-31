/**
 * Выбранный профиль персонажа (мультипрофиль, girl-history/multiprofile_plan.md Ф1).
 *
 * null — профиль явно не выбран: заголовок `x-character-id` не шлётся, и бэкенд работает
 * с профилем по умолчанию (минимальный id). Так прежнее поведение сохраняется дословно.
 */

const STORAGE_KEY = 'nova-admin:profile-id';

export const CHARACTER_ID_HEADER = 'x-character-id';

export function getProfileId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setProfileId(id: number | null): void {
  if (id === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, String(id));
}

/** Состав профилей изменился (создан/удалён) — оболочка перечитывает список в шапке. */
export const PROFILES_CHANGED_EVENT = 'nova:profiles-changed';

export function emitProfilesChanged(): void {
  document.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT));
}
