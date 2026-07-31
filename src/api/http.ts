import axios, { AxiosError, type AxiosInstance } from 'axios';
import { ADMIN_KEY_HEADER, getAdminKey } from '../state/admin-key.js';

/**
 * Единственная точка выхода в сеть. Компоненты сюда не заглядывают — они работают через
 * `api/<группа>-api.ts` и не знают ни про заголовки, ни про ключ.
 *
 * Три вещи, каждая из которых ломается при копировании из соседней админки:
 *
 *  1. НЕТ глобального `Content-Type: application/json`: загрузка файла референса идёт
 *     multipart, и глобальный json-заголовок затёр бы boundary. Axios ставит нужный тип
 *     сам — json для объекта, multipart с boundary для FormData.
 *  2. Ключ доступа кладётся в `x-admin-key` и сервером НЕ выдаётся: он задаётся человеком
 *     в шапке, а не приходит в ответе (в отличие от прежнего `x-owner-key`).
 *  3. Текст ошибки лежит в поле `error`, а не `message`.
 */

/**
 * Базовый путь API.
 *
 * Прод задаёт его явно (`VITE_API_BASE=/girl-history` в workflow сборки). Дев-дефолт
 * обязан учитывать `base`: ЗАМЕРЕНО — dev-сервер Vite снимает префикс `base` с входящего
 * пути ДО сопоставления с правилами прокси, поэтому голый `/api/...` до прокси не доходит
 * и отдаёт 404, а `/girl-history-admin/api/...` доходит. Приложение живёт по base, значит
 * и запросы должны идти оттуда же.
 */
const configuredBase = import.meta.env.VITE_API_BASE?.trim() ?? '';
const devBase = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');
export const API_BASE = configuredBase === '' ? devBase : configuredBase;

const client: AxiosInstance = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const key = getAdminKey();
  if (key !== null) config.headers.set(ADMIN_KEY_HEADER, key);
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error))
);

/** Ошибка запроса с уже человеческим текстом. Компоненты показывают `message` как есть. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly serverMessage: string | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 409 — конфликт состояния: идёт прогон, устарел `updatedAt`, справочник используется. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 401 — не задан или неверен ключ доступа к движку. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

interface BackendError {
  error?: unknown;
}

function readServerMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = (data as BackendError).error;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Сбой генерации из-за исчерпанных кредитов провайдера. Бэкенд свои кредиты не считает и
 * пробрасывает ошибку провайдера как есть («DeepSeek вернул 402: …» в поле error, тот же
 * текст в imageError поста и в report прогона) — поэтому распознавание здесь, по тексту.
 *
 * Маркер «вернул 402» точный — это формат обёртки бэкенда; остальные — эвристика по словам
 * биллинга. Голое «402» матчить НЕЛЬЗЯ: room_402 из промптов дало бы ложное срабатывание.
 */
export function creditsExhaustedText(raw: string): string | null {
  const lower = raw.toLowerCase();
  const isBilling =
    lower.includes('вернул 402') ||
    lower.includes('insufficient') ||
    lower.includes('credit balance') ||
    lower.includes('payment required') ||
    lower.includes('billing');
  if (!isBilling) return null;

  if (lower.includes('higgsfield')) {
    return 'Недостаточно кредитов для генерации изображения (Higgsfield). Пополните баланс и повторите.';
  }
  const provider = lower.includes('deepseek')
    ? 'DeepSeek'
    : lower.includes('claude') || lower.includes('anthropic')
      ? 'Claude'
      : 'LLM-провайдер';
  return `Недостаточно кредитов для генерации текста (${provider}). Пополните баланс и повторите.`;
}

function toApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) return new ApiError('Непредвиденная ошибка', null);

  const status = error.response?.status ?? null;
  const serverMessage = readServerMessage(error.response?.data);

  if (status === null) {
    return new ApiError(
      'Нет связи с сервером. Проверьте, что бэкенд запущен и доступен по адресу прокси.',
      null
    );
  }

  const credits = serverMessage === null ? null : creditsExhaustedText(serverMessage);
  if (credits !== null) return new ApiError(credits, status, serverMessage);

  switch (status) {
    case 401:
      return new ApiError(
        'Нужен ключ доступа к движку. Введите его в шапке — сервер требует заголовок x-admin-key.',
        status,
        serverMessage
      );
    case 413:
      return new ApiError(serverMessage ?? 'Файл слишком большой.', status, serverMessage);
    case 429:
      return new ApiError(
        'Слишком много запросов подряд. Лимит на запуск генерации и импорт — 15 за 15 минут, ' +
          'на остальные изменения — 60. Подождите и повторите.',
        status,
        serverMessage
      );
    case 500:
      return new ApiError(serverMessage ?? 'Внутренняя ошибка сервера.', status, serverMessage);
    default:
      return new ApiError(serverMessage ?? `Ошибка запроса (${status}).`, status, serverMessage);
  }
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Непредвиденная ошибка';
}

export default client;
