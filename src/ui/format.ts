/** Форматирование для интерфейса. */

/**
 * Дата-время в местном формате. На вход — ISO-строки бэкенда (`createdAt`, `updatedAt`).
 *
 * ВАЖНО: к полям `date` и `weekday` дня это НЕ применять. Их считает сервер от `startDate`
 * в UTC (chronicle-service.ts:214-222) и отдаёт готовыми — локальный пересчёт сдвинет
 * день на границе суток.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** `YYYY-MM-DD` для полей ввода даты и для `startDate` при создании хроники. */
export function toDateInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Русское склонение: plural(3, 'день', 'дня', 'дней') → 'дня'. */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function pluralWithCount(count: number, one: string, few: string, many: string): string {
  return `${count} ${plural(count, one, few, many)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Первая буква имени для заглушки аватара. */
export function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed === '' ? '?' : trimmed.charAt(0).toUpperCase();
}
