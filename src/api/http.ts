import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { OWNER_KEY_HEADER, getOwnerKey, rememberOwnerKey } from '../state/owner-key.js';

/**
 * Единственная точка выхода в сеть. Компоненты сюда не заглядывают — они работают
 * через api/<сущность>-api.ts и не знают ни про заголовки, ни про токены.
 *
 * Три вещи, каждая из которых ломается при копировании из ai-prompt-admin:
 *
 *  1. НЕТ глобального `Content-Type: application/json`. В админке он задан на инстансе
 *     (api.ts:11-14), а у нас создание профиля и загрузка референсов идут multipart —
 *     глобальный json-заголовок затёр бы boundary и запрос развалился бы.
 *     Axios сам ставит нужный тип: json для объекта, multipart с boundary для FormData.
 *  2. `x-owner-key` читается из ОТВЕТА и сохраняется (см. интерцептор ниже).
 *  3. Текст ошибки лежит в поле `error`, а не `message`. Админка читает `data.message`
 *     (prompt-component.ts:328) — здесь это дало бы заглушку вместо сообщения бэкенда.
 *     Проверено на живом API: `{"error":"Профиль модели не найден"}`.
 */

/** Дев: `/api` (dev-сервер снимает префикс). Прод: `/girl-history`. */
const configuredBase = import.meta.env.VITE_API_BASE?.trim() ?? '';
export const API_BASE = configuredBase === '' ? '/api' : configuredBase;

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
});

client.interceptors.request.use((config) => {
  const key = getOwnerKey();
  if (key !== null) config.headers.set(OWNER_KEY_HEADER, key);
  return config;
});

/**
 * Ключ приходит в заголовке ответа на `POST /personas` и `GET /personas`, когда клиент
 * его не прислал. Читаем на КАЖДОМ ответе, включая ошибочные: дешевле, чем гадать, на каком
 * маршруте сервер решил его выдать.
 */
function captureOwnerKey(response: AxiosResponse | undefined): void {
  const issued = response?.headers[OWNER_KEY_HEADER] as unknown;
  if (typeof issued === 'string' && issued.trim() !== '') rememberOwnerKey(issued);
}

client.interceptors.response.use(
  (response) => {
    captureOwnerKey(response);
    return response;
  },
  (error: unknown) => {
    if (error instanceof AxiosError) captureOwnerKey(error.response);
    return Promise.reject(toApiError(error));
  }
);

/** Ошибка запроса с уже человеческим текстом. Компоненты показывают `message` как есть. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Сырой текст бэкенда — для отладки, если сообщение подменено на объясняющее. */
    readonly serverMessage: string | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 409 — конфликт состояния: идёт генерация, устарел `updatedAt`, упёрлись в лимит. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 429 — сработал лимит запросов. */
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

function toApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return new ApiError('Непредвиденная ошибка', null);
  }

  const status = error.response?.status ?? null;
  const serverMessage = readServerMessage(error.response?.data);

  if (status === null) {
    return new ApiError(
      'Нет связи с сервером. Проверьте, что бэкенд запущен и доступен по адресу прокси.',
      null
    );
  }

  // Коды, где текст бэкенда либо отсутствует, либо менее понятен, чем наш.
  switch (status) {
    case 413:
      return new ApiError(
        serverMessage ?? 'Файл слишком большой — предел 5 МБ.',
        status,
        serverMessage
      );
    case 429:
      return new ApiError(
        'Слишком много запросов подряд. Лимит на запуск генерации и загрузку фото — ' +
          '15 за 15 минут, на остальные изменения — 60. Подождите и повторите.',
        status,
        serverMessage
      );
    case 500:
      return new ApiError(serverMessage ?? 'Внутренняя ошибка сервера.', status, serverMessage);
    default:
      return new ApiError(serverMessage ?? `Ошибка запроса (${status}).`, status, serverMessage);
  }
}

/** Текст ошибки для показа. Не-ApiError тоже переводим во что-то читаемое. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Непредвиденная ошибка';
}

export default client;
