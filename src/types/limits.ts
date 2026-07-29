/**
 * Границы, которые проверяет бэкенд. Дублируем на клиенте, чтобы показывать счётчики
 * и не ловить 400/409/413 вслепую. Источники — в комментариях; при расхождении прав бэкенд.
 */

/** persona-dto.ts:11-16 */
export const PERSONA_NAME_MAX = 120;
export const PERSONA_PROMPT_MIN = 10;
export const PERSONA_PROMPT_MAX = 8000;
/** persona-dto.ts:29 */
export const PERSONA_APPEARANCE_MAX = 4000;

/** day-dto.ts:18-21 */
export const DAY_TITLE_MAX = 200;
export const DAY_TEXT_MAX = 8000;
export const DAY_MOOD_MAX = 80;
export const DAY_TAGS_MAX = 12;
export const DAY_TAG_LENGTH_MAX = 40;

/** chronicle-dto.ts:12-15 + chronicle-service.ts:42 (MAX_PERIOD_DAYS в конфиге) */
export const PERIOD_MIN = 1;
export const PERIOD_MAX = 90;
export const PERIOD_PRESETS = [7, 30, 90] as const;
export const PROMPT_EXTRA_MAX = 2000;
/** chronicle-dto.ts:23 */
export const REGENERATE_DAYS_MAX = 400;

/** server-config.ts:42 — MAX_PERSONA_IMAGES. Превышение → 409. */
export const PERSONA_IMAGES_MAX = 5;
/** server-config.ts:53 — MAX_UPLOAD_BYTES. Больше → 413. */
export const UPLOAD_BYTES_MAX = 5 * 1024 * 1024;
/** server-config.ts:62 — MAX_CHRONICLES_PER_PERSONA. Превышение → 409. */
export const CHRONICLES_PER_PERSONA_MAX = 20;

/** persona-controller.ts:38 — сервер режет limit до 100. */
export const PERSONA_PAGE_LIMIT_MAX = 100;

/** Типы файлов, которые бэкенд определяет по сигнатуре (utils/image-type.ts). */
export const ACCEPTED_IMAGE_MIME = 'image/jpeg,image/png,image/gif,image/webp';
