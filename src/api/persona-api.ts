import http from './http.js';
import { PERSONA_PAGE_LIMIT_MAX } from '../types/limits.js';
import type {
  CreatePersonaInput,
  PersonaList,
  PersonaOwner,
  UpdatePersonaInput,
} from '../types/persona.js';

/**
 * Профили персонажей. `POST` и `PATCH` идут multipart, потому что несут файл аватара —
 * заголовок Content-Type задавать вручную НЕЛЬЗЯ, axios сам проставит boundary.
 */
export const PersonaApi = {
  /** Список владельца. Сервер режет limit до 100 (persona-controller.ts:38). */
  async list(limit = 20, offset = 0): Promise<PersonaList> {
    const response = await http.get<PersonaList>('/personas', {
      params: { limit: Math.min(limit, PERSONA_PAGE_LIMIT_MAX), offset: Math.max(offset, 0) },
    });
    return response.data;
  },

  async get(ownerToken: string): Promise<PersonaOwner> {
    const response = await http.get<PersonaOwner>(`/personas/${encodeURIComponent(ownerToken)}`);
    return response.data;
  },

  async create(input: CreatePersonaInput): Promise<PersonaOwner> {
    const form = new FormData();
    form.append('name', input.name);
    form.append('sourcePrompt', input.sourcePrompt);
    if (input.photo) form.append('photo', input.photo);

    const response = await http.post<PersonaOwner>('/personas', form);
    return response.data;
  },

  /**
   * Частичная правка. Пустое тело без файла бэкенд отвергает с 400 «Нечего обновлять»
   * (persona-controller.ts:63-65) — вызывающий обязан не звать метод впустую.
   */
  async update(ownerToken: string, input: UpdatePersonaInput): Promise<PersonaOwner> {
    const form = new FormData();
    if (input.name !== undefined) form.append('name', input.name);
    if (input.sourcePrompt !== undefined) form.append('sourcePrompt', input.sourcePrompt);
    // appearance может осмысленно очищаться в null — пустая строка на бэкенде станет null.
    if (input.appearance !== undefined) form.append('appearance', input.appearance ?? '');
    if (input.photo) form.append('photo', input.photo);

    const response = await http.patch<PersonaOwner>(
      `/personas/${encodeURIComponent(ownerToken)}`,
      form
    );
    return response.data;
  },

  /** Каскадом сносит все хроники, дни и файлы профиля. Ответ 204, тела нет. */
  async remove(ownerToken: string): Promise<void> {
    await http.delete(`/personas/${encodeURIComponent(ownerToken)}`);
  },
};
