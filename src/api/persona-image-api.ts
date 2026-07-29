import http from './http.js';
import type { PersonaImage } from '../types/persona.js';

interface ImageListResponse {
  items: PersonaImage[];
  total: number;
}

/**
 * Референсы — фото, влияющие на генерацию.
 *
 * ВНИМАНИЕ К ЛИМИТУ: `upload` и `reanalyze` висят на `generationLimiter`
 * (persona-image-controller.ts:45 и :79) — том же жёстком лимите 15 запросов / 15 минут,
 * что и запуск хроники. Несколько повторных разборов подряд, и «Сгенерировать» ответит 429.
 */
export const PersonaImageApi = {
  async list(ownerToken: string): Promise<PersonaImage[]> {
    const response = await http.get<ImageListResponse>(
      `/personas/${encodeURIComponent(ownerToken)}/images`
    );
    return response.data.items;
  },

  /**
   * Несколько файлов одним запросом, поле `images` (upload.ts:24 — до 10 за раз).
   * Точный предел на профиль — 5, его проверяет сервис и отвечает 409.
   * Каждая картинка разбирается vision ПОСЛЕДОВАТЕЛЬНО, так что запрос небыстрый.
   */
  async upload(ownerToken: string, files: File[]): Promise<PersonaImage[]> {
    const form = new FormData();
    for (const file of files) form.append('images', file);

    const response = await http.post<ImageListResponse>(
      `/personas/${encodeURIComponent(ownerToken)}/images`,
      form
    );
    return response.data.items;
  },

  /** Правка описания руками: пользователь всегда главнее vision. */
  async updateDescription(
    ownerToken: string,
    imageId: number,
    description: string | null
  ): Promise<PersonaImage> {
    const response = await http.patch<PersonaImage>(
      `/personas/${encodeURIComponent(ownerToken)}/images/${imageId}`,
      { description }
    );
    return response.data;
  },

  /** Перезапросить разбор — например, после сбоя vision при загрузке. */
  async reanalyze(ownerToken: string, imageId: number): Promise<PersonaImage> {
    const response = await http.post<PersonaImage>(
      `/personas/${encodeURIComponent(ownerToken)}/images/${imageId}/analyze`,
      {}
    );
    return response.data;
  },

  async remove(ownerToken: string, imageId: number): Promise<void> {
    await http.delete(`/personas/${encodeURIComponent(ownerToken)}/images/${imageId}`);
  },
};
