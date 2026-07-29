/** Зеркало girl-history/src/dtos/persona-dto.ts. */

import type { ChronicleSummary } from './chronicle.js';

/**
 * Референсное изображение — НЕ аватар.
 *
 * Аватар профиля (`photoUrl` ниже) — чистое оформление, в LLM не уходит. А эти картинки
 * разбираются vision, и их описания попадают в промпт всех хроник профиля
 * (girl-history/src/services/generation/prompt-builder.ts:48-59).
 */
export interface PersonaImage {
  id: number;
  /**
   * Готовая ссылка от бэкенда. Собирать её самим НЕЛЬЗЯ: префикс зависит от окружения —
   * локально `/media/…`, на проде `/girl-history/media/…` (storage-service.ts:85-87).
   */
  url: string;
  /**
   * Что vision увидел на картинке. `null` — разбор не удался, и тогда картинка
   * **в промпт не попадает вовсе** (prompt-builder.ts:48-50 отбрасывает пустые).
   * Пользователь может дописать описание руками или перезапросить разбор.
   */
  description: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Приватное представление профиля — владельцу. Промпт виден только здесь. */
export interface PersonaOwner {
  id: number;
  name: string;
  /** Текстовая основа генерации. */
  sourcePrompt: string;
  /** Описание внешности словами. Заполняет только пользователь, vision его не трогает. */
  appearance: string | null;
  /** Аватар. Оформление: в генерации не участвует. */
  photoUrl: string | null;
  images: PersonaImage[];
  /** ПРАВО ПРАВКИ, а не ссылка для передачи. Делятся `publicToken` хроники. */
  ownerToken: string;
  createdAt: string;
  chronicles: ChronicleSummary[];
}

export interface PersonaListItem {
  id: number;
  name: string;
  photoUrl: string | null;
  ownerToken: string;
  chroniclesCount: number;
  createdAt: string;
}

export interface PersonaList {
  items: PersonaListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreatePersonaInput {
  name: string;
  sourcePrompt: string;
  photo?: File | null;
}

export interface UpdatePersonaInput {
  name?: string;
  sourcePrompt?: string;
  appearance?: string | null;
  photo?: File | null;
}
